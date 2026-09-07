/**
 * Celebi VS Code Extension — entry point.
 *
 * Lean viewer: a lazy repository tree backed by the Celebi API
 * and a detail webview aligned with celebi_ui's
 * CelebiExplorer/DetailPanel. Results come from the DITE HTTP API.
 */
import * as path from 'path';
import { timing, elapsed } from './timing';
import * as vscode from 'vscode';
import { CelebiTreeProvider } from './tree/treeProvider';
import { CelebiTreeItem } from './treeItem';
import { affectsTree } from './tree/treeChanges';
import { YukiClient } from './yuki/client';
import { readProjectMeta, readFileForPreview } from './projectMeta';
import { runCelebiPython, ObjectDetailData, disposeCelebiPythonWorkers } from './celebiScript';
import { DetailWebviewProvider } from './webview/detailWebview';
import {
    buildSelectNodePayload, buildImpressionLoading, buildImpressionReady,
    buildImpressionError, NodeDetail,
} from './webview/detailMessages';

export function activate(context: vscode.ExtensionContext): void {
    const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!projectRoot) {
        void vscode.window.showInformationMessage(
            'Celebi: open a workspace folder to browse its repository.'
        );
        return;
    }

    // -- Project metadata & yuki client --
    timing('extension.activate', {
        extension: context.extensionPath,
        project: projectRoot,
        pid: process.pid,
        vscode_version: vscode.version,
    });
    const meta = readProjectMeta(projectRoot);
    const config = vscode.workspace.getConfiguration('celebi');
    const baseUrl = meta.diteUrl || config.get<string>('diteServerUrl', 'http://127.0.0.1:3315');
    const yuki = new YukiClient(baseUrl);

    // -- Tree --
    const provider = new CelebiTreeProvider(projectRoot);
    const treeView = vscode.window.createTreeView('celebiTreeView', {
        treeDataProvider: provider,
    });
    timing('tree.view.created', { visible: treeView.visible });
    context.subscriptions.push(treeView.onDidExpandElement(event => {
        timing('tree.view.expanded', { node: event.element.nodeId });
    }));
    context.subscriptions.push(treeView.onDidChangeVisibility(event => {
        timing('tree.view.visibility', { visible: event.visible });
    }));

    const updateDiteStatus = async (): Promise<void> => {
        const started = performance.now();
        timing('dite.status.start');
        const status = await yuki.fetchDiteStatus();
        provider.setDiteStatus(status);
        timing('dite.status.done', { status, total_ms: elapsed(started) });
    };

    context.subscriptions.push(
        treeView,
        vscode.commands.registerCommand('celebi.refreshTree', async () => {
            await provider.refresh();
            void updateDiteStatus();
        }),
        vscode.commands.registerCommand('celebi.refreshDite', () => void updateDiteStatus())
    );

    // -- Detail webview --
    // Selection sequence token: async detail payloads from a stale selection
    // must not overwrite newer ones.
    let selectionSeq = 0;

    const loadImpression = async (impression: string, mySeq: number): Promise<void> => {
        if (!meta.projectUuid) {
            detail.show(buildImpressionError('Project UUID missing — cannot load results.'));
            return;
        }
        detail.show(buildImpressionLoading());
        try {
            const [items, status, workflow] = await Promise.all([
                yuki.fetchImpressionResults(meta.projectUuid, impression),
                yuki.fetchImpressionStatus(meta.projectUuid, impression),
                yuki.fetchImpressionWorkflow(meta.projectUuid, impression),
            ]);
            if (mySeq !== selectionSeq) return;
            detail.show(buildImpressionReady(items, status.status, status.details, workflow));
        } catch (err) {
            if (mySeq !== selectionSeq) return;
            const message = err instanceof Error ? err.message : String(err);
            detail.show(buildImpressionError(message));
        }
    };

    const detail = new DetailWebviewProvider({
        onSelectImpression: async (impression) => {
            await loadImpression(impression, selectionSeq);
        },
        onNavigate: async (targetPath) => {
            const item = await provider.resolveItem(targetPath);
            if (!item) return;
            await treeView.reveal(item, { select: true, focus: true });
        },
    }, context.extensionPath);
    context.subscriptions.push(detail);

    // -- Selection → detail payload --
    treeView.onDidChangeSelection(async (e) => {
        const item = e.selection[0];
        if (!item) return;
        await showDetail(item);
    });

    const showDetail = async (item: CelebiTreeItem): Promise<void> => {
        const started = performance.now();
        const mySeq = ++selectionSeq;
        const node = item.node;

        // Status/error rows are not explorable objects — skip the detail panel.
        if (node.id === '__dite_status__' || node.id.startsWith('__error__')) return;

        timing('detail.selection', { node: node.id, selection: mySeq });
        if (node.type === 'file') {
            const fileData = node.data as Record<string, unknown>;
            const absolutePath = String(fileData.absolutePath || path.join(projectRoot, node.id));
            const nodeDetail: NodeDetail = {
                id: node.id, name: node.name, kind: 'file',
                celebiType: null, data: fileData,
            };
            let file;
            try {
                file = readFileForPreview(absolutePath);
            } catch {
                file = undefined;
            }
            detail.show(buildSelectNodePayload(nodeDetail, null, null, provider.getTypeMap(), meta.projectUuid, file));
            timing('detail.file.sent', { node: node.id, total_ms: elapsed(started) });
            return;
        }

        const nodeDetail: NodeDetail = {
            id: node.id, name: node.name, kind: node.type,
            celebiType: node.celebiType, data: { ...node.data, childrenCount: node.children.length },
        };

        const fsPath = path.join(projectRoot, node.id);
        // Show the selected node immediately, then fill in its API detail.
        detail.show(buildSelectNodePayload(nodeDetail, null, null, provider.getTypeMap(), meta.projectUuid));
        let result: ObjectDetailData;
        try {
            result = await runCelebiPython('detail', projectRoot, fsPath) as ObjectDetailData;
        } catch (error) {
            if (mySeq !== selectionSeq) return;
            void vscode.window.showErrorMessage(`Celebi: could not load details: ${String(error)}`);
            return;
        }
        if (mySeq !== selectionSeq) return;
        const mergedConfig = result.config;
        nodeDetail.data = { ...nodeDetail.data, ...result.data };
        detail.show(buildSelectNodePayload(
            nodeDetail, mergedConfig, result.readme, { ...provider.getTypeMap(), ...result.typeMap }, meta.projectUuid
        ));

        timing('detail.payload.sent', { node: node.id, selection: mySeq, total_ms: elapsed(started) });

        // Auto-fetch results for the default impression when a task is selected
        const impression = mergedConfig.impression as string | undefined;
        if (node.celebiType === 'task' && impression && meta.projectUuid) {
            const resultsStarted = performance.now();
            await loadImpression(impression, mySeq);
            timing('detail.results.done', { node: node.id, results_ms: elapsed(resultsStarted) });
        }
    }

    // -- File watcher: refresh the tree on project changes (debounced) --
    const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(projectRoot, '**/*')
    );
    let debounceTimer: NodeJS.Timeout | undefined;
    const scheduleRefresh = (uri: vscode.Uri, change: 'change' | 'structure') => {
        const relativePath = path.relative(projectRoot, uri.fsPath).split(path.sep).join('/');
        if (!affectsTree(relativePath, change)) return;
        timing('tree.watch.schedule', { path: relativePath, change, debounce_ms: 800 });
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => void provider.refresh(), 800);
    };
    watcher.onDidChange(uri => scheduleRefresh(uri, 'change'));
    watcher.onDidCreate(uri => scheduleRefresh(uri, 'structure'));
    watcher.onDidDelete(uri => scheduleRefresh(uri, 'structure'));
    context.subscriptions.push(watcher, { dispose: () => {
        if (debounceTimer) clearTimeout(debounceTimer);
    } });

    void provider.refresh().then(() => {
        timing('extension.initial_refresh.done');
        // Warm the root cache; the view shares this pending request when opened.
        const warmStarted = performance.now();
        return provider.getChildren().then(children => {
            timing('extension.root_warm.done', {
                count: children.length,
                total_ms: elapsed(warmStarted),
            });
        });
    }).then(() => {
        return updateDiteStatus();
    }).catch(error => {
        timing('extension.initial_refresh.error', { message: String(error) });
    });
}

export function deactivate(): void {
    disposeCelebiPythonWorkers();
}
