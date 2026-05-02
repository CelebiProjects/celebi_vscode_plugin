/**
 * Trace / dependency DAG visualization webview.
 *
 * Runs shell.tree() in the CelebiChrono Python API and renders the
 * result as a styled HTML page using the Celebi output formatter.
 */
import * as vscode from 'vscode';
import { execPython } from '../pythonRunner';
import { escapeHtml, getErrorHtml } from './baseWebview';
import { formatCelebiOutput } from '../formatOutput';

let panel: vscode.WebviewPanel | undefined;

export async function showTraceView(objectName?: string) {
    try {
        const treeData = await execPython(`shell.tree()`);
        const html = getTraceHtml(treeData);

        if (panel) {
            panel.webview.html = html;
            panel.reveal();
            return;
        }

        panel = vscode.window.createWebviewPanel(
            'celebiTrace', 'Celebi Trace',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: true }
        );

        panel.onDidDispose(() => { panel = undefined; });
        panel.webview.html = html;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (panel) {
            panel.webview.html = getErrorHtml(message);
            panel.reveal();
        } else {
            panel = vscode.window.createWebviewPanel(
                'celebiTrace', 'Celebi Trace',
                { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
                { enableScripts: true }
            );
            panel.onDidDispose(() => { panel = undefined; });
            panel.webview.html = getErrorHtml(message);
        }
    }
}

function getTraceHtml(treeData: string): string {
    const formattedContent = formatCelebiOutput(treeData);

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
    </style>
</head>
<body>
    <h1>\u{1F4C1} Project Tree</h1>
    <div class="tree-container">
        ${formattedContent || '<div style="color:var(--vscode-descriptionForeground);">(empty)</div>'}
    </div>
</body>
</html>`;
}
