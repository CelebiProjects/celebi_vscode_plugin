import * as vscode from 'vscode';
import { execPython } from './pythonRunner';

export class CelebiWebviewProvider {
    private panel: vscode.WebviewPanel | undefined;
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
            // Get dependency DAG data
            const dagData = await this.getDagData(objectName);
            this.panel.webview.html = this.getTraceHtml(dagData);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.panel.webview.html = this.getErrorHtml(message);
        }
    }

    private async getDagData(objectName?: string): Promise<{ nodes: string[], edges: any[] }> {
        const objExpr = objectName ? `shell.MANAGER.sub_object('${objectName}')` : 'shell.MANAGER.current_object()';
        const result = await execPython(`
            dag = ${objExpr}.build_dependency_dag()
            nodes = list(dag.nodes())
            edges = [(str(u), str(v), dag.edges[u, v]) for u, v in dag.edges()]
            (nodes, edges)
        `);

        // Parse the result
        // Expected format: ([GenTask, FitTask, Gen, Fit], [(GenTask, FitTask, {...}), ...])
        return this.parseDagResult(result);
    }

    private parseDagResult(result: string): { nodes: string[], edges: any[] } {
        try {
            // Simple parsing - extract nodes and edges from Python repr
            const nodes: string[] = [];
            const edges: any[] = [];

            // Extract nodes between first [ and ]
            const nodesMatch = result.match(/\[([^\]]+)\]/);
            if (nodesMatch) {
                const nodeList = nodesMatch[1].split(',').map(s => s.trim());
                nodes.push(...nodeList);
            }

            return { nodes, edges };
        } catch (e) {
            return { nodes: [], edges: [] };
        }
    }

    private getTraceHtml(dagData: { nodes: string[], edges: any[] }): string {
        const nodesJson = JSON.stringify(dagData.nodes);
        const edgesJson = JSON.stringify(dagData.edges);

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Celebi Trace</title>
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
        .graph-container {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 20px;
            background: var(--vscode-panel-background);
            min-height: 400px;
        }
        .node {
            display: inline-block;
            padding: 8px 16px;
            margin: 8px;
            border-radius: 4px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            font-size: 13px;
            cursor: pointer;
        }
        .node:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .edge {
            margin: 4px 0;
            padding: 4px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .info {
            margin-top: 20px;
            padding: 10px;
            background: var(--vscode-input-background);
            border-radius: 4px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <h1>Project Dependency Graph</h1>
    <div class="graph-container">
        <div id="nodes"></div>
        <div id="edges"></div>
    </div>
    <div class="info">
        <strong>Nodes:</strong> <span id="node-count">0</span> |
        <strong>Edges:</strong> <span id="edge-count">0</span>
    </div>
    <script>
        const nodes = ${nodesJson};
        const edges = ${edgesJson};

        // Render nodes
        const nodesContainer = document.getElementById('nodes');
        nodes.forEach(node => {
            const div = document.createElement('div');
            div.className = 'node';
            div.textContent = node;
            div.onclick = () => {
                vscode.postMessage({ command: 'selectNode', node });
            };
            nodesContainer.appendChild(div);
        });

        // Render edges
        const edgesContainer = document.getElementById('edges');
        edges.forEach(edge => {
            const div = document.createElement('div');
            div.className = 'edge';
            div.textContent = edge[0] + ' → ' + edge[1];
            edgesContainer.appendChild(div);
        });

        // Update counts
        document.getElementById('node-count').textContent = nodes.length;
        document.getElementById('edge-count').textContent = edges.length;
    </script>
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
