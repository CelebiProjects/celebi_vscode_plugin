/**
 * Directory listing webview.
 *
 * Renders the output of a CelebiChrono shell ls() call as an HTML page.
 */
import * as vscode from 'vscode';
import { escapeHtml } from './baseWebview';

let panel: vscode.WebviewPanel | undefined;

export async function showLsView(title: string, lsData: string) {
    if (panel) {
        panel.reveal();
    } else {
        panel = vscode.window.createWebviewPanel(
            'celebiLs', 'Celebi LS',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.onDidDispose(() => {
            panel = undefined;
        });
    }

    panel.title = `\u{1F4C1} ${title}`;
    panel.webview.html = getLsHtml(title, lsData);
}

function getLsHtml(title: string, lsData: string): string {
    const escapedLs = escapeHtml(lsData);

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Celebi LS - ${escapeHtml(title)}</title>
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
    <h1>\u{1F4C1} ${escapeHtml(title)}</h1>
    <div class="ls-container">
        <pre>${escapedLs}</pre>
    </div>
</body>
</html>`;
}
