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
    onSelectImpression(impression: string): void;
    onNavigate(path: string): void;
}

export class DetailWebviewProvider implements vscode.Disposable {
    public static readonly viewType = 'celebiDetail';

    private panel: vscode.WebviewPanel | undefined;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        private readonly callbacks: DetailWebviewCallbacks,
        private readonly extensionPath: string,
    ) {}

    /** Create (once) and push a payload into the panel. */
    show(payload: ExtensionToWebview): void {
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
            this.panel.webview.html = getDetailHtml(this.panel.webview, scriptUri);
            this.panel.webview.onDidReceiveMessage((raw: unknown) => {
                const msg = parseWebviewMessage(raw);
                if (!msg) return;
                if (msg.type === 'selectImpression') {
                    this.callbacks.onSelectImpression(msg.impression);
                }
                if (msg.type === 'navigateToPath') {
                    this.callbacks.onNavigate(msg.path);
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
