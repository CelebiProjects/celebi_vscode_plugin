/**
 * Celebi VS Code Extension — entry point.
 *
 * Lean viewer: a repository tree (objects + workspace files, built by a
 * one-shot Python script) and a detail webview aligned with celebi_ui's
 * CelebiExplorer/DetailPanel. Results come from the DITE HTTP API.
 */
import * as path from 'path';
import * as vscode from 'vscode';
import { CelebiTreeProvider } from './tree/treeProvider';
import { CelebiTreeItem } from './treeItem';
import { YukiClient } from './yuki/client';
import { readProjectMeta, readObjectConfig, readFileForPreview } from './projectMeta';
import { runCelebiPython } from './celebiScript';
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
    const meta = readProjectMeta(projectRoot);
    const config = vscode.workspace.getConfiguration('celebi');
    const baseUrl = meta.diteUrl || config.get<string>('diteServerUrl', 'http://127.0.0.1:3315');
    const yuki = new YukiClient(baseUrl);

    // -- Tree --
    const provider = new CelebiTreeProvider(projectRoot);
    const treeView = vscode.window.createTreeView('celebiTreeView', {
        treeDataProvider: provider,
    });

    const updateDiteStatus = async (): Promise<void> => {
        provider.setDiteStatus(await yuki.fetchDiteStatus());
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
            const item = provider.getItemById(targetPath);
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
        const mySeq = ++selectionSeq;
        const node = item.node;

        // Status/error rows are not explorable objects — skip the detail panel.
        if (node.id === '__dite_status__' || node.id === '__error__') return;

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
            return;
        }

        const nodeDetail: NodeDetail = {
            id: node.id, name: node.name, kind: node.type,
            celebiType: node.celebiType, data: { ...node.data, childrenCount: node.children.length },
        };

        const fsPath = path.join(projectRoot, node.id);
        const { config: objectConfig, localConfig } = readObjectConfig(fsPath);
        const mergedConfig = { ...(objectConfig || {}), ...(localConfig || {}) };

        let readme: string | null = null;
        try {
            const result = (await runCelebiPython('readme', projectRoot, fsPath)) as { readme: string | null };
            readme = result.readme;
        } catch {
            // README is optional — keep null
        }

        if (mySeq !== selectionSeq) return;
        detail.show(buildSelectNodePayload(
            nodeDetail, mergedConfig, readme, provider.getTypeMap(), meta.projectUuid
        ));

        // Auto-fetch results for the default impression when a task is selected
        const impression = mergedConfig.impression as string | undefined;
        if (node.celebiType === 'task' && impression && meta.projectUuid) {
            await loadImpression(impression, mySeq);
        }
    }

    // -- File watcher: refresh the tree on project changes (debounced) --
    const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(projectRoot, '**/*')
    );
    let debounceTimer: NodeJS.Timeout | undefined;
    const scheduleRefresh = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => void provider.refresh(), 800);
    };
    watcher.onDidChange(scheduleRefresh);
    watcher.onDidCreate(scheduleRefresh);
    watcher.onDidDelete(scheduleRefresh);
    context.subscriptions.push(watcher);

    void provider.refresh().then(() => void updateDiteStatus());
}

export function deactivate(): void { /* nothing to clean up */ }
