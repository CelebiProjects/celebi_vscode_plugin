/**
 * Directory listing webview.
 *
 * Renders the output of a CelebiChrono shell ls() call as a styled HTML page
 * using the Celebi output formatter.
 */
import * as vscode from 'vscode';
import { escapeHtml } from './baseWebview';
import { formatCelebiOutput } from '../formatOutput';

let panel: vscode.WebviewPanel | undefined;

export async function showLsView(title: string, lsData: string) {
    console.log('[DEBUG showLsView] title:', title, 'data length:', lsData?.length);

    const html = getLsHtml(title, lsData);

    if (panel) {
        panel.title = `\u{1F4C1} ${title}`;
        panel.webview.html = html;
        panel.reveal();
        console.log('[DEBUG showLsView] existing panel updated, html length:', html.length);
        return;
    }

    panel = vscode.window.createWebviewPanel(
        'celebiLs',
        `\u{1F4C1} ${title}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.onDidDispose(() => { panel = undefined; });

    panel.webview.html = html;
    console.log('[DEBUG showLsView] panel created, html length:', html.length);
}

function getLsHtml(title: string, lsData: string): string {
    const formattedContent = formatCelebiOutput(lsData);

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
    </style>
</head>
<body>
    <h1>\u{1F4C1} ${escapeHtml(title)}</h1>
    <div class="ls-container">
        ${formattedContent || '<div style="color:var(--vscode-descriptionForeground);">(empty)</div>'}
    </div>
</body>
</html>`;
}
