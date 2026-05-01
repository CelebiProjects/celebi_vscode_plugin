/**
 * CelebiChrono output formatter.
 *
 * Converts CelebiChrono's terminal markup into styled HTML.
 * Markers:
 *   title0: / titleN:  — section heading
 *   comment:            — muted annotation text
 *   code:               — monospace code block
 *   message: <value>    — status line (green if truthy, red if falsy)
 *   o-->                — decorated arrow / link indicator
 *   : <text>            — continuation line (indented, lighter)
 */

/** Convert a raw CelebiChrono output string into styled HTML. */
export function formatCelebiOutput(text: string): string {
    if (!text) return '';

    return text
        .split('\n')
        .map(line => wrapLine(line))
        .join('\n');
}

/** Wrap a single line in the appropriate styled HTML based on its marker. */
function wrapLine(line: string): string {
    const trimmed = line.trim();
    if (!trimmed) return '';

    // title0: or titleN:
    const titleMatch = trimmed.match(/^title(\d*):\s*(.*)/);
    if (titleMatch) {
        const level = parseInt(titleMatch[1]) || 0;
        const content = escapeHtml(titleMatch[2]);
        const sizes = ['18px', '16px', '14px', '13px'];
        const size = sizes[Math.min(level, sizes.length - 1)];
        return `<div style="font-weight:600;font-size:${size};color:var(--vscode-textPreformat-foreground);margin-top:8px;">${content}</div>`;
    }

    // comment:
    const commentMatch = trimmed.match(/^comment:\s*(.*)/);
    if (commentMatch) {
        return `<div style="color:var(--vscode-descriptionForeground);font-style:italic;margin-left:4px;">${escapeHtml(commentMatch[1])}</div>`;
    }

    // code:
    const codeMatch = trimmed.match(/^code:\s*(.*)/);
    if (codeMatch) {
        return `<div style="font-family:'SF Mono',Monaco,'Courier New',monospace;font-size:12px;background:var(--vscode-textCodeBlock-background);padding:4px 8px;border-radius:3px;margin:4px 0;">${escapeHtml(codeMatch[1])}</div>`;
    }

    // message: True / message: False
    const msgMatch = trimmed.match(/^message:\s*(.*)/);
    if (msgMatch) {
        const value = msgMatch[1].trim();
        const isTrue = /^(True|true|yes|ok|success)\b/i.test(value);
        const isFalse = /^(False|false|none?|no|error|fail)\b/i.test(value);
        let color = 'var(--vscode-foreground)';
        if (isTrue) color = 'var(--vscode-testing-iconPassed)';
        if (isFalse) color = 'var(--vscode-errorForeground)';
        return `<div style="margin-left:4px;"><span style="color:var(--vscode-descriptionForeground);">message: </span><span style="color:${color};font-weight:500;">${escapeHtml(value)}</span></div>`;
    }

    // o--> (arrow / decorator)
    if (trimmed.includes('o-->')) {
        const parts = trimmed.split('o-->');
        const before = escapeHtml(parts[0]);
        const after = parts.length > 1 ? escapeHtml(parts[1]) : '';
        return `<div style="margin-left:4px;">${before}<span style="color:var(--vscode-textLink-foreground);font-weight:600;">→</span>${after}</div>`;
    }

    // Continuation lines (start with ": ")
    if (trimmed.startsWith(': ')) {
        return `<div style="color:var(--vscode-descriptionForeground);margin-left:16px;">${escapeHtml(trimmed.substring(2))}</div>`;
    }

    // Default: plain text
    return `<div>${escapeHtml(line)}</div>`;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
