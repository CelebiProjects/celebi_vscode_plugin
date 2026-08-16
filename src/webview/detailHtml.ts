/**
 * HTML template for the detail webview, mirroring celebi_ui's
 * DetailPanel.js + FilePreview.js sections:
 *   header (name + type badge) → impression select → impression id
 *   → README → Job Status → Predecessors → Successors → Object Info
 *   → Contents count → Results grid (+lightbox) | File info + preview
 */
import * as vscode from 'vscode';

export function getDetailHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} http: https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Celebi Detail</title>
<style>
    body {
        margin: 0; padding: 0.75rem 1rem;
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
    }
    h2 { margin: 0; font-size: 1.15rem; display: flex; align-items: center; gap: 0.5rem; }
    h4 { margin: 0 0 0.4rem; font-size: 0.95rem; text-transform: uppercase;
         letter-spacing: 0.03em; color: var(--vscode-descriptionForeground); }
    .detailHeader { display: flex; justify-content: space-between; align-items: center;
                    padding-bottom: 0.5rem; border-bottom: 1px solid var(--vscode-panel-border); }
    .typeLabel { font-size: 0.7rem; font-weight: 600; color: #fff; padding: 2px 8px;
                 border-radius: 10px; text-transform: capitalize; }
    .section { margin: 1rem 0; }
    .collapseHeader { cursor: pointer; user-select: none; }
    .collapseArrow { display: inline-block; width: 1rem; color: var(--vscode-descriptionForeground); }
    .readmeBox { border: 1px solid var(--vscode-panel-border); border-radius: 4px;
                 padding: 0.6rem 0.75rem; white-space: pre-wrap; }
    .statusBadge { display: inline-block; padding: 2px 10px; border-radius: 10px;
                   font-size: 0.8rem; font-weight: 600; color: #fff; }
    .statusDone { background: #21ba45; }
    .statusFailed { background: #db2828; }
    .statusPending { background: #fbbd08; }
    .runnerBadge { display: inline-block; margin-left: 0.5rem; padding: 2px 8px;
                   border-radius: 10px; background: var(--vscode-badge-background);
                   color: var(--vscode-badge-foreground); font-size: 0.8rem; }
    code { font-family: var(--vscode-editor-font-family); }
    .workflowId { margin-left: 0.5rem; font-size: 0.85rem; }
    .statusDetails { margin-left: 0.5rem; font-size: 0.85rem; color: var(--vscode-descriptionForeground); }
    .relationTag { display: inline-block; margin: 0.2rem 0.3rem 0 0; padding: 2px 8px;
                   border: 1px solid var(--vscode-panel-border); border-radius: 10px;
                   font-size: 0.8rem; cursor: pointer; }
    .relationTag:hover { background: var(--vscode-list-hoverBackground); }
    .paramList { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }
    .paramKey { color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); }
    .commandsPre { background: var(--vscode-textCodeBlock-background);
                   padding: 0.6rem 0.75rem; border-radius: 6px; overflow-x: auto;
                   font-family: var(--vscode-editor-font-family); font-size: 0.85rem;
                   line-height: 1.6; margin: 0.25rem 0 0; white-space: pre-wrap; }
    .resultGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                  gap: 0.75rem; margin-top: 0.5rem; }
    .resultImage { width: 100%; cursor: zoom-in; border: 1px solid var(--vscode-panel-border);
                   border-radius: 4px; }
    .resultFile { display: flex; align-items: center; gap: 0.4rem; }
    .resultFileLink { color: var(--vscode-textLink-foreground); text-decoration: none;
                      font-size: 0.85rem; word-break: break-all; }
    .impressionId { font-size: 0.9rem; }
    .imagePreview { max-width: 100%; }
    .codePreview { background: var(--vscode-textCodeBlock-background); padding: 0.6rem 0.75rem;
                   border-radius: 4px; overflow-x: auto; white-space: pre-wrap; }
    .unsupported { color: var(--vscode-descriptionForeground); font-style: italic; }
    .emptyState { text-align: center; margin-top: 3rem; color: var(--vscode-descriptionForeground); }
    #lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 9999;
                display: flex; align-items: center; justify-content: center; cursor: zoom-out; }
    #lightbox img { max-width: 90vw; max-height: 90vh; object-fit: contain; }
    #impressionSelect { font-size: 0.85rem; }
</style>
</head>
<body>
<div id="emptyState" class="emptyState"><p>Select a node from the tree to explore</p></div>

<div id="detail" hidden>
  <div class="detailHeader">
    <h2><span id="nodeName"></span><span id="typeLabel" class="typeLabel"></span></h2>
    <select id="impressionSelect" hidden></select>
  </div>

  <div class="section" id="impressionIdSection" hidden>
    <h4>Impression ID</h4>
    <code id="impressionId" class="impressionId"></code>
  </div>

  <div class="section" id="readmeSection" hidden>
    <h4 class="collapseHeader"><span class="collapseArrow" id="readmeArrow">▾</span> README</h4>
    <div id="readmeBox" class="readmeBox"></div>
  </div>

  <div class="section" id="statusSection" hidden>
    <h4>Job Status</h4>
    <div class="statusRow">
      <span id="statusBadge" class="statusBadge"></span>
      <span id="runnerBadge" class="runnerBadge" hidden></span>
      <code id="workflowId" class="workflowId"></code>
      <span id="statusDetails" class="statusDetails"></span>
    </div>
  </div>

  <div class="section" id="predecessorsSection" hidden>
    <h4 class="collapseHeader"><span class="collapseArrow" id="predecessorsArrow">▾</span> <span id="predecessorsTitle">Predecessors</span></h4>
    <div id="predecessorsBox"></div>
  </div>

  <div class="section" id="successorsSection" hidden>
    <h4 class="collapseHeader"><span class="collapseArrow" id="successorsArrow">▾</span> <span id="successorsTitle">Successors</span></h4>
    <div id="successorsBox"></div>
  </div>

  <div class="section" id="objectInfoSection" hidden>
    <h4>Object Info</h4>
    <div id="paramList" class="paramList"></div>
    <div id="infoRows"></div>
    <div id="codeFilesBox"></div>
    <div id="commandsBox"></div>
  </div>

  <div class="section" id="contentsSection" hidden>
    <h4>Contents</h4>
    <p id="contentsCount"></p>
  </div>

  <div class="section" id="resultsSection" hidden>
    <h4>Results</h4>
    <div id="resultsStatus"></div>
    <div id="resultGrid" class="resultGrid"></div>
  </div>

  <div class="section" id="fileInfoSection" hidden>
    <h4>File Info</h4>
    <div id="fileInfoRows"></div>
  </div>

  <div class="section" id="previewSection" hidden>
    <h4>Preview</h4>
    <div id="previewBox"></div>
  </div>
</div>

<div id="lightbox" hidden><img id="lightboxImg" alt=""></div>

<script nonce="${nonce}">
(function () {
    const vscode = acquireVsCodeApi();
    const $ = (id) => document.getElementById(id);
    const TYPE_COLORS = { task: '#f97316', algorithm: '#3b82f6', data: '#22c55e', directory: '#eab308' };

    let current = null;

    function esc(text) {
        const div = document.createElement('div');
        div.textContent = text === null || text === undefined ? '' : String(text);
        return div.innerHTML;
    }

    function hideAllSections() {
        for (const id of ['impressionIdSection', 'readmeSection', 'statusSection',
            'predecessorsSection', 'successorsSection', 'objectInfoSection',
            'contentsSection', 'resultsSection', 'fileInfoSection', 'previewSection']) {
            $(id).hidden = true;
        }
    }

    function setCollapse(id, title, count, shown) {
        const arrow = $(id + 'Arrow');
        arrow.textContent = shown ? '▾' : '▸';
        $(id + 'Title').textContent = count !== null ? title + ' (' + count + ')' : title;
    }

    function renderNode(msg) {
        current = msg;
        hideAllSections();
        $('emptyState').hidden = true;
        $('detail').hidden = false;

        $('nodeName').textContent = msg.node.name;
        const typeLabel = $('typeLabel');
        const color = TYPE_COLORS[msg.node.celebiType] || TYPE_COLORS.directory;
        typeLabel.style.background = color;
        typeLabel.textContent = msg.node.celebiType
            ? msg.node.celebiType.charAt(0).toUpperCase() + msg.node.celebiType.slice(1)
            : 'Directory';
        if (msg.node.kind === 'file') {
            typeLabel.textContent = 'File';
            typeLabel.style.background = '#888';
        }

        // Impression selector (reversed, like celebi_ui)
        const impressions = Array.isArray(msg.config?.impressions) ? [...msg.config.impressions].reverse() : [];
        const select = $('impressionSelect');
        if (msg.node.kind === 'object' && impressions.length > 0) {
            select.hidden = false;
            select.innerHTML = '<option value="">Select impression</option>' + impressions.map((imp) => {
                const uuid = typeof imp === 'object' ? String(imp?.uuid ?? '') : String(imp);
                const timestamp = (typeof imp === 'object' && imp.timestamp)
                    ? new Date(imp.timestamp).toLocaleString(undefined, { hourCycle: 'h23' }) : '';
                const short = uuid ? uuid.substring(0, 7) : '(no uuid)';
                const label = timestamp ? short + ' (' + timestamp + ')' : short;
                return '<option value="' + esc(uuid) + '">' + esc(label) + '</option>';
            }).join('');
            select.value = msg.config.impression || '';
        } else {
            select.hidden = true;
            select.innerHTML = '';
        }

        const selectedImpression = msg.config?.impression || '';
        if (selectedImpression) {
            $('impressionIdSection').hidden = false;
            $('impressionId').textContent = selectedImpression;
        }

        // README
        if (msg.readme) {
            $('readmeSection').hidden = false;
            $('readmeBox').textContent = msg.readme;
            $('readmeArrow').textContent = '▾';
        }

        // Predecessors / Successors
        const preds = Array.isArray(msg.config?.predecessors) ? msg.config.predecessors : [];
        const succs = Array.isArray(msg.config?.successors) ? msg.config.successors : [];
        if (preds.length > 0) {
            $('predecessorsSection').hidden = false;
            setCollapse('predecessors', 'Predecessors', preds.length, true);
            $('predecessorsBox').innerHTML = preds.map((p) => relationTag(p, msg.typeMap)).join('');
        }
        if (succs.length > 0) {
            $('successorsSection').hidden = false;
            setCollapse('successors', 'Successors', succs.length, false);
            $('successorsBox').innerHTML = succs.map((s) => relationTag(s, msg.typeMap)).join('');
            $('successorsBox').hidden = true;
        }

        // Object info
        if (msg.node.kind === 'object') {
            $('objectInfoSection').hidden = false;
            const data = msg.node.data || {};
            const params = data.parameters && typeof data.parameters === 'object' ? data.parameters : {};
            $('paramList').innerHTML = Object.entries(params).map(([k, v]) =>
                '<div class="paramKey">' + esc(k) + '</div><div>' + esc(v) + '</div>'
            ).join('');
            const rows = [];
            if (data.environment) rows.push('<div><strong>Environment:</strong> ' + esc(data.environment) + '</div>');
            if (data.memory_limit) rows.push('<div><strong>Memory Limit:</strong> ' + esc(data.memory_limit) + '</div>');
            if (data.default_runner) rows.push('<div><strong>Default runner:</strong> ' + esc(data.default_runner) + '</div>');
            if (Array.isArray(data.aliases) && data.aliases.length > 0) rows.push('<div><strong>Aliases:</strong> ' + esc(data.aliases.join(', ')) + '</div>');
            $('infoRows').innerHTML = rows.join('');
            const codeFiles = Array.isArray(data.code_files) ? data.code_files : [];
            $('codeFilesBox').innerHTML = codeFiles.length > 0
                ? '<h4>Algorithm files</h4><ul>' + codeFiles.map((f) =>
                    '<li>' + esc(typeof f === 'string' ? f : (f.name || f.path) + ': ' + (f.code || '')) + '</li>'
                ).join('') + '</ul>'
                : '';
            const commands = Array.isArray(data.commands) ? data.commands : [];
            $('commandsBox').innerHTML = commands.length > 0
                ? '<h4>Commands</h4><pre class="commandsPre">' + esc(commands.join('\n')) + '</pre>'
                : '';
        }

        // Contents count fallback
        if (!msg.readme) {
            $('contentsSection').hidden = false;
            $('contentsCount').textContent = (msg.node.data?.childrenCount || 0) + ' item(s)';
        }

        // File preview
        if (msg.node.kind === 'file') {
            $('fileInfoSection').hidden = false;
            const f = msg.node.data || {};
            $('fileInfoRows').innerHTML =
                '<div><strong>Path:</strong> ' + esc(f.name || msg.node.name) + '</div>' +
                '<div><strong>Size:</strong> ' + esc(f.size?.human_readable || f.size?.raw || '—') + '</div>' +
                '<div><strong>Modified:</strong> ' + esc(f.lastModified || '—') + '</div>';
            $('previewSection').hidden = false;
            $('previewBox').innerHTML = renderPreview(msg.file);
        }

        // Results area (populated by renderResults)
        if (msg.node.celebiType === 'task') {
            $('resultsSection').hidden = false;
            $('resultsStatus').textContent = '';
            $('resultGrid').innerHTML = '';
        }
    }

    function relationTag(path, typeMap) {
        const type = typeMap && typeMap[path];
        const color = TYPE_COLORS[type] || null;
        const style = color ? 'style="background:' + color + '15;color:' + color + ';border-color:' + color + '40"' : '';
        return '<span class="relationTag" data-path="' + esc(path) + '" ' + style + ' role="button" tabindex="0">' + esc(path) + '</span>';
    }

    function renderPreview(file) {
        if (!file) return '<p class="unsupported">Preview not available.</p>';
        if (file.kind === 'text') {
            return '<pre class="codePreview"><code>' + esc(file.content) + '</code></pre>';
        }
        if (file.kind === 'image') {
            return '<img class="imagePreview" alt="preview" src="data:' + esc(file.mime) + ';base64,' + esc(file.base64) + '">';
        }
        if (file.kind === 'pdf') {
            return '<p class="unsupported">PDF preview not available. Open the file externally to view.</p>';
        }
        return '<p class="unsupported">Preview not available for .' + esc(file.ext) + ' files. Open externally to view.</p>';
    }

    function renderResults(msg) {
        if (!current || current.node.celebiType !== 'task') return;
        $('resultsSection').hidden = false;
        if (msg.state === 'loading') {
            $('resultsStatus').textContent = 'Loading results...';
            return;
        }
        if (msg.state === 'error') {
            $('resultsStatus').innerHTML = '<p class="unsupported">' + esc(msg.error) + '</p>';
            return;
        }

        // Job status
        $('statusSection').hidden = !msg.status;
        if (msg.status) {
            const badge = $('statusBadge');
            badge.textContent = msg.status;
            badge.className = 'statusBadge ' + (
                ['finished', 'success', 'archived'].includes(msg.status) ? 'statusDone'
                : ['failed', 'error'].includes(msg.status) ? 'statusFailed'
                : 'statusPending'
            );
            const parts = (msg.workflow || '').split(/\\s+/).filter(Boolean);
            $('runnerBadge').hidden = !parts[0];
            if (parts[0]) $('runnerBadge').textContent = parts[0];
            $('workflowId').textContent = parts.slice(1).join(' ');
            $('statusDetails').textContent = msg.details || '';
        }

        const items = msg.items || [];
        if (items.length === 0) {
            $('resultsStatus').textContent = 'No results for this impression.';
            $('resultGrid').innerHTML = '';
            return;
        }
        $('resultsStatus').textContent = '';
        $('resultGrid').innerHTML = items.map((item) => {
            if (item.is_plot) {
                return '<img class="resultImage" alt="' + esc(item.name) + '" src="' + esc(item.url) + '" data-url="' + esc(item.url) + '" data-name="' + esc(item.name) + '">';
            }
            return '<div class="resultFile"><span>📄</span><a class="resultFileLink" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' + esc(item.name) + '</a></div>';
        }).join('');
    }

    // Impression selector
    $('impressionSelect').addEventListener('change', (e) => {
        if (e.target.value) {
            vscode.postMessage({ type: 'selectImpression', impression: e.target.value });
        }
    });

    // Relation tags (delegated)
    document.addEventListener('click', (e) => {
        const tag = e.target.closest('.relationTag');
        if (tag) {
            vscode.postMessage({ type: 'navigateToPath', path: tag.dataset.path });
            return;
        }
        const img = e.target.closest('.resultImage');
        if (img) {
            $('lightboxImg').src = img.dataset.url;
            $('lightbox').hidden = false;
        }
    });

    // Lightbox close
    $('lightbox').addEventListener('click', () => {
        $('lightbox').hidden = true;
        $('lightboxImg').src = '';
    });

    // Hide broken plot images. Capture phase: the error event does not bubble,
    // and inline onerror handlers are blocked by the CSP nonce policy.
    document.addEventListener('error', (e) => {
        if (e.target.classList.contains('resultImage')) {
            e.target.style.display = 'none';
        }
    }, true);

    // Collapsible headers
    $('readmeSection').querySelector('.collapseHeader').addEventListener('click', () => {
        const box = $('readmeBox');
        box.hidden = !box.hidden;
        $('readmeArrow').textContent = box.hidden ? '▸' : '▾';
    });
    $('predecessorsSection').querySelector('.collapseHeader').addEventListener('click', () => {
        const box = $('predecessorsBox');
        box.hidden = !box.hidden;
        $('predecessorsArrow').textContent = box.hidden ? '▸' : '▾';
    });
    $('successorsSection').querySelector('.collapseHeader').addEventListener('click', () => {
        const box = $('successorsBox');
        box.hidden = !box.hidden;
        $('successorsArrow').textContent = box.hidden ? '▸' : '▾';
    });

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'selectNode') renderNode(msg);
        if (msg.type === 'impressionResults') renderResults(msg);
    });
})();
</script>
</body>
</html>`;
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
