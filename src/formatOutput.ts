/**
 * CelebiChrono output formatter.
 *
 * Converts CelebiChrono's terminal markup into styled HTML.
 * Markers:
 *   title0: / titleN:  — section heading
 *   comment:            — muted annotation text (README body)
 *   code:               — monospace code block
 *   message: <value>    — status line (green if truthy, red if falsy)
 *   o-->                — decorated arrow / link indicator
 *   : <text>            — continuation line (indented, lighter)
 */

const BASE_SIZE = '12px';

// ---- Readme / info splitting ----

/**
 * Split CelebiChrono output into README and non-README parts.
 *
 * README content includes title*, comment, code, and decorator lines
 * (o-->, continuation).  Status/info lines (message:, DITE) go into info.
 * When no README markers are present at all, the entire output is treated
 * as README (so ls / tree / status outputs still display in full).
 */
export function splitReadmeOutput(text: string): { readme: string; info: string } {
    if (!text) return { readme: '', info: '' };

    const lines = text.split('\n');
    const readmeLines: string[] = [];
    const infoLines: string[] = [];
    let seenReadmeMarker = false;

    for (const line of lines) {
        const trimmed = line.trim();

        if (isReadmeLine(trimmed)) {
            readmeLines.push(line);
            seenReadmeMarker = true;
        } else if (isInfoLine(trimmed)) {
            infoLines.push(line);
        } else {
            // Lines before any README marker are likely status preamble → info.
            // After we've seen a README marker, unclassified lines are part of the README.
            if (seenReadmeMarker) {
                readmeLines.push(line);
            } else {
                infoLines.push(line);
            }
        }
    }

    return {
        readme: readmeLines.join('\n').trim(),
        info: infoLines.join('\n').trim()
    };
}

function isReadmeLine(line: string): boolean {
    return /^title\d*:/.test(line) ||
        /^comment:/.test(line) ||
        /^code:/.test(line) ||
        /^o-->/.test(line) ||
        /^: /.test(line);
}

function isInfoLine(line: string): boolean {
    const trimmed = line.trim();
    return /^message:/.test(trimmed) || trimmed.includes('>>>> DITE:');
}

// ---- HTML formatting ----

/** Convert a raw CelebiChrono output string into styled HTML. */
export function formatCelebiOutput(text: string, options?: { showComments?: boolean; showInfo?: boolean }): string {
    if (!text) return '';

    const showComments = options?.showComments !== false;
    const showInfo = options?.showInfo !== false;

    const lines = text.split('\n');
    console.log('[DEBUG formatCelebiOutput] input lines:', lines.length);

    const filtered = lines
        .filter(line => line.trim() !== '')
        .filter(line => !isDiteLine(line))
        .filter(line => showComments || !isCommentLine(line))
        .filter(line => showInfo || !isInfoLine(line.trim()));
    console.log('[DEBUG formatCelebiOutput] after filter:', filtered.length, 'sample:', filtered.slice(0, 10));

    return filtered
        .map(line => wrapLine(line))
        .join('');
}

function isCommentLine(line: string): boolean {
    return /^comment:/.test(line.trim());
}

/** Skip DITE status lines — they're shown in the tree status item instead. */
function isDiteLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.includes('>>>> DITE:') || /^title\d*:\s*>>>> DITE:/.test(trimmed);
}

/** Wrap a single line in the appropriate styled HTML based on its marker. */
function wrapLine(line: string): string {
    const trimmed = line.trim();
    if (!trimmed) return '';

    // title0: or titleN:
    const titleMatch = trimmed.match(/^title(\d*):\s*(.*)/);
    if (titleMatch) {
        const level = titleMatch[1];
        const content = titleMatch[2];

        // Separators: "---- ..."
        if (/^----/.test(content)) {
            return `<hr style="border-color:var(--vscode-panel-border);margin:6px 0;">`;
        }

        // Field:value metadata (e.g. "Environment: ", "Memory limit: ")
        // CelebiChrono outputs "fieldname: : value:" — strip the wrapping colons.
        const fieldMatch = content.match(/^(\w[\w\s]*?):\s*(.*)/);
        if (fieldMatch) {
            const field = escapeHtml(fieldMatch[1]);
            let value = fieldMatch[2].replace(/^:\s*/, '').replace(/:$/, '');
            value = escapeHtml(value);
            return `<div style="font-size:${BASE_SIZE};margin-left:4px;margin-top:2px;">` +
                `<span style="color:var(--vscode-descriptionForeground);">${field}:</span> ` +
                `<span style="color:var(--vscode-foreground);">${value}</span></div>`;
        }

        // Section header (o-->, -->o, etc.)
        const indent = level ? (parseInt(level) * 8 + 8) : 4;
        return `<div style="font-weight:600;font-size:${BASE_SIZE};color:var(--vscode-symbolIcon-variableForeground);margin-top:6px;margin-left:${indent}px;">${escapeHtml(content)}</div>`;
    }

    // comment: — blue italic
    const commentMatch = trimmed.match(/^comment:\s*(.*)/);
    if (commentMatch) {
        return `<div style="color:var(--vscode-textLink-foreground);font-style:italic;font-size:${BASE_SIZE};margin-left:8px;">${escapeHtml(commentMatch[1])}</div>`;
    }

    // code: — monospace
    const codeMatch = trimmed.match(/^code:\s*(.*)/);
    if (codeMatch) {
        return `<div style="font-family:'SF Mono',Monaco,'Courier New',monospace;font-size:${BASE_SIZE};color:var(--vscode-textPreformat-foreground);background:var(--vscode-textCodeBlock-background);padding:2px 8px;border-radius:3px;margin:2px 0;">${escapeHtml(codeMatch[1])}</div>`;
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
        return `<div style="font-size:${BASE_SIZE};margin-left:4px;">` +
            `<span style="color:var(--vscode-descriptionForeground);">message: </span>` +
            `<span style="color:${color};font-weight:500;">${escapeHtml(value)}</span></div>`;
    }

    // o--> (arrow / decorator)
    if (trimmed.includes('o-->')) {
        const parts = trimmed.split('o-->');
        const before = escapeHtml(parts[0]);
        const after = parts.length > 1 ? escapeHtml(parts[1].replace(/:$/, '')) : '';
        return `<div style="font-size:${BASE_SIZE};margin-left:4px;">` +
            `<span style="color:var(--vscode-symbolIcon-methodForeground);">${before}</span>` +
            `<span style="color:var(--vscode-textLink-foreground);font-weight:600;">→</span>` +
            `<span style="color:var(--vscode-foreground);">${after}</span></div>`;
    }

    // Continuation lines (start with ": ")
    if (trimmed.startsWith(': ')) {
        return `<div style="color:var(--vscode-descriptionForeground);font-size:${BASE_SIZE};margin-left:16px;">${escapeHtml(trimmed.substring(2))}</div>`;
    }

    // Plain line field: : value: (CelebiChrono format without titleN: prefix)
    const plainFieldMatch = trimmed.match(/^(\w[\w\s]*?):\s+:\s*(.*)/);
    if (plainFieldMatch) {
        const field = escapeHtml(plainFieldMatch[1]);
        const value = escapeHtml(plainFieldMatch[2].replace(/:$/, ''));
        return `<div style="font-size:${BASE_SIZE};margin-left:4px;margin-top:2px;">` +
            `<span style="color:var(--vscode-descriptionForeground);">${field}:</span> ` +
            `<span style="color:var(--vscode-foreground);">${value}</span></div>`;
    }

    // Tree item: [N] (type)   name: — strip trailing ":" from name
    const treeItemMatch = trimmed.match(/^\[(\d+)\]\s*\((\w+)\)\s+(.*)/);
    if (treeItemMatch) {
        const idx = treeItemMatch[1];
        const type = treeItemMatch[2];
        const name = escapeHtml(treeItemMatch[3].replace(/:$/, ''));
        const typeColor = type === 'directory' ? 'var(--vscode-symbolIcon-folderForeground)' : 'var(--vscode-symbolIcon-methodForeground)';
        return `<div style="font-size:${BASE_SIZE};margin-left:4px;">` +
            `<span style="color:var(--vscode-descriptionForeground);">[${idx}]</span> ` +
            `<span style="color:${typeColor};">(${escapeHtml(type)})</span> ` +
            `<span style="color:var(--vscode-foreground);">${name}</span></div>`;
    }

    // Default: plain text — strip trailing ":" delimiter
    return `<div style="font-size:${BASE_SIZE};color:var(--vscode-foreground);">${escapeHtml(line.replace(/:$/, ''))}</div>`;
}

// ---- Markdown rendering ----

/**
 * Render Markdown text as styled HTML.
 * Handles headings, lists, tables, code blocks, inline formatting,
 * blockquotes, links, images, and horizontal rules.
 */
export function renderMarkdown(text: string): string {
    if (!text) return '';
    const lines = text.split('\n');
    const html: string[] = [];
    const parts: string[] = [];
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Code block fence
        if (/^```/.test(trimmed)) {
            if (inCodeBlock) {
                html.push('</code></pre>');
                inCodeBlock = false;
            } else {
                flushParagraph(parts, html);
                const lang = trimmed.substring(3).trim();
                html.push(`<pre style="background:var(--vscode-textCodeBlock-background);padding:12px;border-radius:4px;overflow:auto;font-size:11px;"><code${lang ? ` class="language-${lang}"` : ''}>`);
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            html.push(escapeHtml(line));
            continue;
        }

        // Table
        if (/\|.*\|/.test(trimmed)) {
            flushParagraph(parts, html);
            const cells = trimmed.split('|').filter(c => c.trim());
            const isHeader = i + 1 < lines.length && /^\|?[\s\-:]+\|/.test(lines[i + 1].trim());
            const tag = isHeader ? 'th' : 'td';
            html.push('<tr>');
            for (const cell of cells) {
                html.push(`<${tag} style="padding:4px 12px;text-align:left;${isHeader ? 'font-weight:600;background:var(--vscode-panel-background);' : ''}">${inlineMarkdown(cell.trim())}</${tag}>`);
            }
            html.push('</tr>');
            continue;
        }

        // Skip separator lines in tables
        if (/^\|?[\s\-:]+\|/.test(trimmed) && i > 0 && /\|.*\|/.test(lines[i - 1].trim())) {
            continue;
        }

        // Blank line → paragraph break
        if (!trimmed) {
            flushParagraph(parts, html);
            continue;
        }

        // Horizontal rule
        if (/^(---|\*\*\*|___)$/.test(trimmed)) {
            flushParagraph(parts, html);
            html.push('<hr style="border-color:var(--vscode-panel-border);margin:12px 0;">');
            continue;
        }

        // Headings
        const h3 = trimmed.match(/^###\s+(.*)/);
        if (h3) { flushParagraph(parts, html); html.push(`<h3 style="font-size:14px;font-weight:600;color:var(--vscode-symbolIcon-variableForeground);margin-top:12px;">${inlineMarkdown(h3[1])}</h3>`); continue; }
        const h2 = trimmed.match(/^##\s+(.*)/);
        if (h2) { flushParagraph(parts, html); html.push(`<h2 style="font-size:16px;font-weight:600;color:var(--vscode-symbolIcon-variableForeground);margin-top:16px;border-bottom:1px solid var(--vscode-panel-border);padding-bottom:4px;">${inlineMarkdown(h2[1])}</h2>`); continue; }
        const h1 = trimmed.match(/^#\s+(.*)/);
        if (h1) { flushParagraph(parts, html); html.push(`<h1 style="font-size:20px;font-weight:700;color:var(--vscode-titleBar-activeForeground);margin-top:12px;">${inlineMarkdown(h1[1])}</h1>`); continue; }

        // Blockquote
        if (/^>\s?/.test(trimmed)) {
            flushParagraph(parts, html);
            html.push(`<blockquote style="border-left:3px solid var(--vscode-textBlockQuote-border);margin:4px 0;padding:4px 12px;color:var(--vscode-textBlockQuote-foreground);">${inlineMarkdown(trimmed.replace(/^>\s?/, ''))}</blockquote>`);
            continue;
        }

        // Unordered list
        const ul = trimmed.match(/^[-*]\s+(.*)/);
        if (ul) { flushParagraph(parts, html); html.push(`<li style="margin-left:16px;">${inlineMarkdown(ul[1])}</li>`); continue; }

        // Ordered list
        const ol = trimmed.match(/^\d+\.\s+(.*)/);
        if (ol) { flushParagraph(parts, html); html.push(`<li style="margin-left:16px;">${inlineMarkdown(ol[1])}</li>`); continue; }

        // Regular line — accumulate into paragraph
        parts.push(inlineMarkdown(line));

        // Also render inline HTML from these lines
    }

    flushParagraph(parts, html);
    if (inCodeBlock) html.push('</code></pre>');
    return html.join('\n');
}

function flushParagraph(parts: string[], html: string[]): void {
    if (parts.length > 0) {
        html.push(`<p style="margin:2px 0;">${parts.join('<br>')}</p>`);
        parts.length = 0;
    }
}

/** Inline formatting: code, bold, italic, links, images. */
function inlineMarkdown(text: string): string {
    let t = escapeHtml(text);

    // Inline code: `text`
    t = t.replace(/`([^`]+)`/g, '<code style="font-family:\'SF Mono\',Monaco,\'Courier New\',monospace;font-size:11px;background:var(--vscode-textCodeBlock-background);padding:1px 4px;border-radius:3px;">$1</code>');

    // Image: ![alt](url)
    t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:4px;margin:4px 0;">');

    // Link: [text](url)
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--vscode-textLink-foreground);">$1</a>');

    // Bold + italic: ***text***
    t = t.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    // Bold: **text**
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic: *text*
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    return t;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}