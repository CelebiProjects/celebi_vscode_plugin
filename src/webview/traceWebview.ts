import * as vscode from 'vscode';
import { execPython } from '../pythonRunner';
import { escapeHtml, getErrorHtml } from './baseWebview';

let panel: vscode.WebviewPanel | undefined;

export async function showTraceView(objectName?: string) {
    if (panel) {
        panel.reveal();
    } else {
        panel = vscode.window.createWebviewPanel(
            'celebiTrace',
            'Celebi Trace',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.onDidDispose(() => {
            panel = undefined;
        });
    }

    try {
        const treeData = await execPython(`shell.tree()`);
        panel.webview.html = getTraceHtml(treeData);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        panel.webview.html = getErrorHtml(message);
    }
}

function getTraceHtml(treeData: string): string {
    const escapedTree = escapeHtml(treeData);

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
