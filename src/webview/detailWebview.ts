/**
 * Singleton detail webview panel.
 *
 * Mirrors celebi_ui's DetailPanel: one panel whose content is swapped on
 * every tree selection. Incoming messages are validated by
 * detailMessages.parseWebviewMessage before hitting the callbacks.
 */
import * as path from 'path';
import * as vscode from 'vscode';
import { getDetailHtml } from './detailHtml';
import { ExtensionToWebview, parseWebviewMessage } from './detailMessages';

export interface DetailWebviewCallbacks {
    onEditReadme(nodeId: string): Promise<{ session: string; content: string }>;
    onSaveReadme(nodeId: string, session: string, content: string): Promise<string>;
    onEditYaml(nodeId: string): Promise<{ session: string; content: string }>;
    onSaveYaml(nodeId: string, session: string, content: string): Promise<string>;
    onSelectImpression(impression: string): void;
    onNavigate(path: string): void;
    onOpenRemoteRootFile(name: string, url: string): void;
    onOpenLocalRootFile(path: string): void;
}

export class DetailWebviewProvider implements vscode.Disposable {
    public static readonly viewType = 'celebiDetail';

    private panel: vscode.WebviewPanel | undefined;
    private selectedNodeId: string | undefined;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        private readonly callbacks: DetailWebviewCallbacks,
        private readonly extensionPath: string,
    ) {}

    /** Create (once) and push a payload into the panel. */
    show(payload: ExtensionToWebview): void {
        if (payload.type === 'selectNode') this.selectedNodeId = payload.node.id;
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel(
                DetailWebviewProvider.viewType,
                'Celebi Detail',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                }
            );
            const scriptUri = this.panel.webview.asWebviewUri(
                vscode.Uri.file(path.join(this.extensionPath, 'media', 'detail.js'))
            );
            const yamlScriptUri = this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(this.extensionPath, 'media', 'yamlPreview.js')));
            this.panel.webview.html = getDetailHtml(this.panel.webview, scriptUri, yamlScriptUri);
            const panel = this.panel;
            this.panel.webview.onDidReceiveMessage(async (raw: unknown) => {
                const msg = parseWebviewMessage(raw);
                if (!msg) return;
                if (msg.type === 'editReadme' || msg.type === 'saveReadme' || msg.type === 'editYaml' || msg.type === 'saveYaml') {
                    const opening = msg.type === 'editReadme' || msg.type === 'editYaml';
                    const isYaml = msg.type === 'editYaml' || msg.type === 'saveYaml';
                    const resultType = isYaml ? 'yamlEditResult' : 'readmeEditResult';
                    const operation = opening ? 'open' : 'save';
                    try {
                        if (opening && msg.nodeId !== this.selectedNodeId) {
                            throw new Error('Selection changed. Select the file again to edit it.');
                        }
                        const result = msg.type === 'editReadme' || msg.type === 'editYaml'
                            ? await (isYaml ? this.callbacks.onEditYaml : this.callbacks.onEditReadme)(msg.nodeId)
                            : { content: await (isYaml ? this.callbacks.onSaveYaml : this.callbacks.onSaveReadme)(msg.nodeId, msg.session, msg.content) };
                        void panel.webview.postMessage({ type: resultType, operation, nodeId: msg.nodeId, ...result });
                    } catch (error) {
                        void panel.webview.postMessage({ type: resultType, operation, nodeId: msg.nodeId, error: String(error instanceof Error ? error.message : error) });
                    }
                }
                if (msg.type === 'selectImpression') {
                    this.callbacks.onSelectImpression(msg.impression);
                }
                if (msg.type === 'navigateToPath') {
                    this.callbacks.onNavigate(msg.path);
                }
                if (msg.type === 'openRemoteRootFile') {
                    this.callbacks.onOpenRemoteRootFile(msg.name, msg.url);
                }
                if (msg.type === 'openLocalRootFile') {
                    this.callbacks.onOpenLocalRootFile(msg.path);
                }
            }, undefined, this.disposables);
            this.panel.onDidDispose(() => { this.panel = undefined; }, undefined, this.disposables);
        }
        this.panel.reveal(undefined, true);
        void this.panel.webview.postMessage(payload);
    }

    dispose(): void {
        this.panel?.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
