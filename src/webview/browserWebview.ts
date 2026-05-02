/**
 * Embedded browser webview.
 *
 * Opens a URL (usually from CelebiChrono's impview) in an <iframe>
 * inside a VS Code webview panel.  Includes toolbar buttons for
 * opening in an external browser and reloading the frame.
 */
import * as vscode from 'vscode';

let panel: vscode.WebviewPanel | undefined;

export async function showBrowser(objectName: string, url: string) {
    const html = getBrowserHtml(objectName, url);

    if (panel) {
        panel.title = `Celebi: ${objectName}`;
        panel.webview.html = html;
        panel.reveal();
        return;
    }

    panel = vscode.window.createWebviewPanel(
        'celebiBrowser',
        `Celebi: ${objectName}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.onDidDispose(() => { panel = undefined; });

    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'openExternal':
                    vscode.env.openExternal(vscode.Uri.parse(message.url));
                    return;
            }
        }
    );

    panel.webview.html = html;
}

function getBrowserHtml(objectName: string, url: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; frame-src ${url} http: https:; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .toolbar {
            padding: 8px 12px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }
        .toolbar span {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .toolbar .url {
            color: var(--vscode-textLink-foreground);
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .toolbar button {
            padding: 4px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }
        .toolbar button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .frame-container {
            flex: 1;
            position: relative;
            overflow: hidden;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
            background: white;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <span>${objectName}</span>
        <span class="url">${url}</span>
        <button onclick="openExternal()">Open in Browser</button>
        <button onclick="reloadFrame()">Reload</button>
    </div>
    <div class="frame-container">
        <iframe id="browserFrame" src="${url}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"></iframe>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const url = '${url}';

        function openExternal() {
            vscode.postMessage({ command: 'openExternal', url: url });
        }

        function reloadFrame() {
            const frame = document.getElementById('browserFrame');
            frame.src = frame.src;
        }

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'reload':
                    reloadFrame();
                    break;
            }
        });
    </script>
</body>
</html>`;
}
