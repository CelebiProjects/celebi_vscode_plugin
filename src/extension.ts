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
import { ProjectFileEditor } from './webview/projectFileEditor';
import { RootViewer } from './rootViewer/rootViewer';
import {
    buildSelectNodePayload, buildImpressionLoading, buildImpressionReady,
    buildImpressionError, NodeDetail,
} from './webview/detailMessages';

export function activate(context: vscode.ExtensionContext): void {
    const projectFolder = vscode.workspace.workspaceFolders?.[0];
    const projectRoot = projectFolder?.uri.fsPath;
    if (!projectFolder || !projectRoot) {
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
    const rootViewer = new RootViewer(context);
    const availableRemoteRoots = new Map<string, string>();
    context.subscriptions.push(rootViewer);

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
        timing('dite.status.done', {
            status, total_ms: elapsed(started),
            error: yuki.lastStatusError || undefined,
        });
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
    let selectedNodeId = '';
    let selectedImpression = '';
    const availableImpressions = new Set<string>();
    const collecting = new Set<string>();

    const loadImpression = async (impression: string, mySeq: number, currentNodeId: string): Promise<void> => {
        availableRemoteRoots.clear();
        if (!meta.projectUuid) {
            detail.show(buildImpressionError('Project UUID missing — cannot load results.', mySeq, currentNodeId));
            return;
        }
        detail.show(buildImpressionLoading(mySeq, currentNodeId));
        try {
            const [items, status, workflow] = await Promise.all([
                yuki.fetchImpressionResults(meta.projectUuid, impression),
                yuki.fetchImpressionStatus(meta.projectUuid, impression),
                yuki.fetchImpressionWorkflow(meta.projectUuid, impression),
            ]);
            if (mySeq !== selectionSeq) return;
            for (const item of items) {
                if (/\.root$/i.test(item.name) || /\.root(?:[?#]|$)/i.test(item.url)) {
                    availableRemoteRoots.set(item.url, item.name);
                }
            }
            detail.show(buildImpressionReady(items, status.status, status.details, workflow, mySeq, currentNodeId));
        } catch (err) {
            if (mySeq !== selectionSeq) return;
            const message = err instanceof Error ? err.message : String(err);
            detail.show(buildImpressionError(message, mySeq, currentNodeId));
        }
    };

    const readmeEditor = new ProjectFileEditor(projectRoot, 'README.md');
    const yamlEditor = new ProjectFileEditor(projectRoot, 'celebi.yaml');
    const detail = new DetailWebviewProvider({
        onEditReadme: async nodeId => {
            const item = provider.getItemById(nodeId);
            if (!item) throw new Error('Select the object again before editing its README.');
            return readmeEditor.open({ id: item.nodeId, kind: item.kind, name: item.node.name });
        },
        onSaveReadme: (nodeId, session, content) => readmeEditor.save(nodeId, session, content),
        onEditYaml: async nodeId => {
            const item = provider.getItemById(nodeId);
            if (!item) throw new Error('Select the object again before editing celebi.yaml.');
            return yamlEditor.open({ id: item.nodeId, kind: item.kind, name: item.node.name });
        },
        onSaveYaml: (nodeId, session, content) => yamlEditor.save(nodeId, session, content),
        onSelectImpression: async (impression) => {
            if (!availableImpressions.has(impression)) return;
            selectedImpression = impression;
            await loadImpression(impression, ++selectionSeq, selectedNodeId);
        },
        onCollectImpression: async (nodeId, impression) => {
            if (!meta.projectUuid || nodeId !== selectedNodeId || impression !== selectedImpression) {
                throw new Error('Select the impression again before collecting its results.');
            }
            if (collecting.has(impression)) throw new Error('This impression is already being collected.');
            const mySeq = selectionSeq;
            collecting.add(impression);
            try {
                await yuki.collectImpression(meta.projectUuid, impression);
            } finally {
                collecting.delete(impression);
                if (mySeq === selectionSeq) await loadImpression(impression, mySeq, nodeId);
            }
        },
        onNavigate: async (targetPath) => {
            const item = await provider.resolveItem(targetPath);
            if (!item) return;
            await treeView.reveal(item, { select: true, focus: true });
        },
        onOpenRemoteRootFile: async (name, url) => {
            const started = Date.now();
            timing('root.open.start', { name, url });
            if (availableRemoteRoots.get(url) !== name) {
                timing('root.open.rejected', { name, reason: 'result-url-not-available' });
                void vscode.window.showErrorMessage('Celebi: this remote ROOT result is no longer available.');
                return;
            }
            try {
                await rootViewer.openRemote(name, url);
                timing('root.open.panel-created', { name, total_ms: Date.now() - started });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                timing('root.open.error', { name, total_ms: Date.now() - started, message });
                void vscode.window.showErrorMessage(`Celebi: could not open ${name}: ${message}`);
            }
        },
        onOpenLocalRootFile: (targetPath) => {
            const item = provider.getItemById(targetPath);
            if (!item || item.node.type !== 'file' || !/\.root$/i.test(item.node.name)) {
                void vscode.window.showErrorMessage('Celebi: this local ROOT file is no longer available.');
                return;
            }
            const fileUri = vscode.Uri.joinPath(projectFolder.uri, ...targetPath.split('/'));
            rootViewer.openLocal(item.node.name, fileUri);
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
        selectedNodeId = node.id;
        selectedImpression = '';
        availableImpressions.clear();

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
        const requests: [Promise<unknown>, Promise<string | null>] = [
            runCelebiPython('detail', projectRoot, fsPath),
            node.type === 'object' ? yamlEditor.read(nodeDetail) : Promise.resolve(null),
        ];
        const [apiDetail, yaml] = await Promise.allSettled(requests);
        if (mySeq !== selectionSeq) return;
        nodeDetail.data.celebiYaml = yaml.status === 'fulfilled' ? yaml.value : null;
        if (yaml.status === 'rejected') nodeDetail.data.celebiYamlError = String(yaml.reason);
        if (apiDetail.status === 'rejected') {
            // Keep the source editable even when malformed YAML prevents API details from loading.
            detail.show(buildSelectNodePayload(nodeDetail, null, null, provider.getTypeMap(), meta.projectUuid));
            void vscode.window.showErrorMessage(`Celebi: could not load details: ${String(apiDetail.reason)}`);
            return;
        }
        const result = apiDetail.value as ObjectDetailData;
        const mergedConfig = result.config;
        if (node.celebiType === 'task') {
            if (typeof mergedConfig.impression === 'string') availableImpressions.add(mergedConfig.impression);
            if (Array.isArray(mergedConfig.impressions)) {
                for (const entry of mergedConfig.impressions) {
                    const uuid = typeof entry === 'string' ? entry : entry?.uuid;
                    if (typeof uuid === 'string') availableImpressions.add(uuid);
                }
            }
        }
        nodeDetail.data = { ...nodeDetail.data, ...result.data };
        detail.show(buildSelectNodePayload(
            nodeDetail, mergedConfig, result.readme, { ...provider.getTypeMap(), ...result.typeMap }, meta.projectUuid
        ));

        timing('detail.payload.sent', { node: node.id, selection: mySeq, total_ms: elapsed(started) });

        // Auto-fetch results for the default impression when a task is selected
        const impression = mergedConfig.impression as string | undefined;
        if (node.celebiType === 'task' && impression && meta.projectUuid) {
            selectedImpression = impression;
            const resultsStarted = performance.now();
            await loadImpression(impression, mySeq, node.id);
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
