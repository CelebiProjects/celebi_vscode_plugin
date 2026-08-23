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
            const commandsPre = $('commandsBox');
            if (commands.length > 0) {
                commandsPre.innerHTML = '<h4>Commands</h4>';
                const pre = document.createElement('pre');
                pre.className = 'commandsPre';
                pre.textContent = commands.join('\n');
                commandsPre.appendChild(pre);
            } else {
                commandsPre.innerHTML = '';
            }
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
            const parts = (msg.workflow || '').trim().split(/\s+/).filter(Boolean);
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
            // ✓ = cached in Yuki; ⬇ = only on the runner, downloadable
            const status = item.in_yuki
                ? '<span class="resultStatusIcon inYuki" title="In Yuki">✓</span>'
                : '<span class="resultStatusIcon notYuki" title="Not in Yuki — download from runner">⬇</span>';
            if (item.is_plot) {
                return '<div class="resultItem">' + status +
                    '<img class="resultImage" alt="' + esc(item.name) + '" src="' + esc(item.url) + '" data-url="' + esc(item.url) + '" data-name="' + esc(item.name) + '">' +
                    '</div>';
            }
            return '<div class="resultItem">' + status +
                '<div class="resultFile"><span>📄</span><a class="resultFileLink" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' + esc(item.name) + '</a></div>' +
                '</div>';
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
