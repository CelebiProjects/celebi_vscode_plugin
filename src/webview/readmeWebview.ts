/**
 * README display webview.
 *
 * Renders pre-formatted Markdown HTML in a persistent webview panel.
 * On first click the panel is created; subsequent clicks update the
 * same panel in-place.
 */
import * as vscode from 'vscode';
import { escapeHtml } from './baseWebview';

let panel: vscode.WebviewPanel | undefined;

export async function showReadmeView(title: string, htmlContent: string) {
    console.log('[DEBUG showReadmeView] title:', title, 'html length:', htmlContent?.length);

    if (panel) {
        panel.title = `README: ${title}`;
        panel.webview.html = getReadmeHtml(panel.webview, title, htmlContent);
        panel.reveal();
        console.log('[DEBUG showReadmeView] existing panel updated');
        return;
    }

    panel = vscode.window.createWebviewPanel(
        'celebiReadme',
        `README: ${title}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true }
    );
    console.log('[DEBUG showReadmeView] panel created');

    panel.onDidDispose(() => { panel = undefined; });

    panel.webview.html = getReadmeHtml(panel.webview, title, htmlContent);
    console.log('[DEBUG showReadmeView] html set, length:', panel.webview.html.length);
}

function getReadmeHtml(webview: vscode.Webview, title: string, content: string): string {
    const cspSource = webview.cspSource;
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} https:; script-src 'none';">
    <title>README - ${escapeHtml(title)}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px 28px;
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            line-height: 1.6;
        }
        .readme-container { max-width: 900px; }
        table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        th { background: var(--vscode-panel-background); }
        th, td { border: 1px solid var(--vscode-panel-border); }
    </style>
</head>
<body>
    <div class="readme-container">
        ${content}
    </div>
</body>
</html>`;
}
