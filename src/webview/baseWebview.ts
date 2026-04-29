export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function getErrorHtml(message: string): string {
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
    <p>${escapeHtml(message)}</p>
</body>
</html>`;
}
