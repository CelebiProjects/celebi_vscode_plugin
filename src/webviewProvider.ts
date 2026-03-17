import * as vscode from 'vscode';
import { execPython } from './pythonRunner';

export class CelebiWebviewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private lsPanel: vscode.WebviewPanel | undefined;
    private browserPanel: vscode.WebviewPanel | undefined;

    async showTraceView(objectName?: string) {
        if (this.panel) {
            this.panel.reveal();
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'celebiTrace',
                'Celebi Trace',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });
        }

        try {
            // Get tree data
            const treeData = await this.getTreeData(objectName);
            this.panel.webview.html = this.getTraceHtml(treeData);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.panel.webview.html = this.getErrorHtml(message);
        }
    }

    private async getTreeData(objectName?: string): Promise<string> {
        const result = await execPython(`shell.tree()`);
        return result;
    }

    async showLsView(title: string, lsData: string) {
        if (this.lsPanel) {
            this.lsPanel.reveal();
        } else {
            this.lsPanel = vscode.window.createWebviewPanel(
                'celebiLs',
                'Celebi LS',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            this.lsPanel.onDidDispose(() => {
                this.lsPanel = undefined;
            });
        }

        this.lsPanel.title = `📁 ${title}`;
        this.lsPanel.webview.html = this.getLsHtml(title, lsData);
    }

    private getLsHtml(title: string, lsData: string): string {
        // Escape HTML special characters
        const escapedLs = lsData
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Celebi LS - ${title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
        }
        h1 {
            font-size: 18px;
            margin-bottom: 20px;
            color: var(--vscode-titleBar-activeForeground);
        }
        .ls-container {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 20px;
            background: var(--vscode-panel-background);
            min-height: 400px;
            overflow: auto;
        }
        pre {
            margin: 0;
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.5;
            white-space: pre;
            color: var(--vscode-foreground);
        }
    </style>
</head>
<body>
    <h1>📁 ${title}</h1>
    <div class="ls-container">
        <pre>${escapedLs}</pre>
    </div>
</body>
</html>`;
    }

    private getTraceHtml(treeData: string): string {
        // Escape HTML special characters
        const escapedTree = treeData
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Celebi Project Tree</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
        }
        h1 {
            font-size: 18px;
            margin-bottom: 20px;
            color: var(--vscode-titleBar-activeForeground);
        }
        .tree-container {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 20px;
            background: var(--vscode-panel-background);
            min-height: 400px;
            overflow: auto;
        }
        pre {
            margin: 0;
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.5;
            white-space: pre;
            color: var(--vscode-foreground);
        }
    </style>
</head>
<body>
    <h1>📁 Project Tree</h1>
    <div class="tree-container">
        <pre>${escapedTree}</pre>
    </div>
</body>
</html>`;
    }

    private getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Celebi Trace - Error</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            padding: 20px;
            background: var(--vscode-editor-background);
            color: var(--vscode-errorForeground);
        }
    </style>
</head>
<body>
    <h1>Error</h1>
    <p>${message}</p>
</body>
</html>`;
    }

    async showBrowser(objectName: string, url: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : vscode.ViewColumn.One;

        // Create new panel or reveal existing one
        if (this.browserPanel) {
            this.browserPanel.reveal(column);
        } else {
            this.browserPanel = vscode.window.createWebviewPanel(
                'celebiBrowser',
                `Celebi: ${objectName}`,
                column || vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.browserPanel.onDidDispose(() => {
                this.browserPanel = undefined;
            });

            // Handle messages from webview
            this.browserPanel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'openExternal':
                            vscode.env.openExternal(vscode.Uri.parse(message.url));
                            return;
                    }
                }
            );
        }

        // Update title and HTML with embedded iframe
        this.browserPanel.title = `Celebi: ${objectName}`;
        this.browserPanel.webview.html = this.getBrowserHtml(objectName, url);
    }

    private getBrowserHtml(objectName: string, url: string): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; frame-src ${url} http: https:; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
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
        .error-message {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
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

        // Handle messages from extension
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
}
