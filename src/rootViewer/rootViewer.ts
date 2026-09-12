import * as path from 'path';
import * as vscode from 'vscode';
import { RootRangeProxy } from './rangeProxy';

export class RootViewer implements vscode.Disposable {
    private readonly proxy = new RootRangeProxy();
    private readonly panels = new Set<vscode.WebviewPanel>();

    constructor(private readonly context: vscode.ExtensionContext) {}

    async openRemote(name: string, upstreamUrl: string): Promise<void> {
        const source = await this.proxy.register(upstreamUrl, name);
        try {
            const externallyReachable = await vscode.env.asExternalUri(vscode.Uri.parse(source.url));
            this.createPanel(name, externallyReachable, source);
        } catch (error) {
            source.dispose();
            throw error;
        }
    }

    openLocal(name: string, fileUri: vscode.Uri): void {
        this.createPanel(name, fileUri);
    }

    private createPanel(name: string, sourceUri: vscode.Uri, source?: vscode.Disposable): void {
        const panel = vscode.window.createWebviewPanel(
            'celebi.rootViewer',
            name,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: source
                    ? [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
                    : [vscode.Uri.joinPath(this.context.extensionUri, 'media'), sourceUri.with({ path: path.posix.dirname(sourceUri.path) })],
            }
        );
        this.panels.add(panel);

        const webview = panel.webview;
        const diagnostics = webview.onDidReceiveMessage(message => {
            if (message?.type === 'rootDiagnostic' && typeof message.message === 'string') {
                console.log('[Celebi ROOT viewer]', name, message.message);
            }
        });
        const jsrootUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'jsroot.min.js')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'rootViewer.js')
        );
        const sourceScriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'rootFileSource.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'rootViewer.css')
        );
        const fileUri = source ? sourceUri : webview.asWebviewUri(sourceUri);
        panel.webview.html = this.getHtml(webview, name, fileUri, jsrootUri, scriptUri, styleUri, sourceScriptUri);

        panel.onDidDispose(() => {
            diagnostics.dispose();
            this.panels.delete(panel);
            source?.dispose();
        });
    }

    private getHtml(
        webview: vscode.Webview,
        name: string,
        fileUri: vscode.Uri,
        jsrootUri: vscode.Uri,
        scriptUri: vscode.Uri,
        styleUri: vscode.Uri,
        sourceScriptUri: vscode.Uri,
    ): string {
        const nonce = randomNonce();
        const connectOrigin = escapeAttribute(new URL(fileUri.toString()).origin);
        const darkMode = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
            || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; connect-src ${webview.cspSource} ${connectOrigin}; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}' 'wasm-unsafe-eval'; worker-src blob:;">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(name)}</title>
<link href="${styleUri}" rel="stylesheet">
<script nonce="${nonce}" src="${jsrootUri}"></script>
<script nonce="${nonce}" src="${sourceScriptUri}"></script>
</head>
<body>
<div id="loading">Opening ${escapeHtml(name)} using byte-range streaming…</div>
<div id="error" hidden></div>
<div id="hierarchy"></div>
<script nonce="${nonce}" id="root-viewer-script"
        data-file-uri="${escapeAttribute(fileUri.toString())}"
        data-dark-mode="${darkMode}"
        src="${scriptUri}"></script>
</body>
</html>`;
    }

    dispose(): void {
        for (const panel of [...this.panels]) panel.dispose();
        this.proxy.dispose();
    }
}

function randomNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let value = '';
    for (let i = 0; i < 32; i++) value += chars.charAt(Math.floor(Math.random() * chars.length));
    return value;
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character] || character);
}

function escapeAttribute(value: string): string {
    return escapeHtml(value);
}
