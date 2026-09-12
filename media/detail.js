(function () {
    const vscode = acquireVsCodeApi();
    const $ = (id) => document.getElementById(id);
    const TYPE_COLORS = { task: '#f97316', algorithm: '#3b82f6', data: '#22c55e', directory: '#eab308' };

    let current = null;
    let currentSelection = 0;
    const collections = new Map();
    const collectionKey = (nodeId, impression) => JSON.stringify([nodeId, impression]);

    function renderCollect() {
        const impression = current?.config?.impression || '';
        const state = collections.get(collectionKey(current?.node.id, impression));
        $('collectResults').disabled = !impression || !current?.projectUuid || !!state?.pending;
        $('collectResults').textContent = state?.pending ? 'Collecting…' : 'Collect';
        $('collectStatus').textContent = state?.message || '';
    }
    // Keep drafts when changing selection or receiving the second detail payload.
    const editableFiles = [
        { id: 'readme', message: 'Readme', name: 'README.md', drafts: new Map() },
        { id: 'yaml', message: 'Yaml', name: 'celebi.yaml', drafts: new Map() },
    ];

    function renderEditableFile(file) {
        const { id, message, name } = file;
        const draft = file.drafts.get(current.node.id);
        const isFile = current.node.kind === 'file' && current.node.name === name && current.file?.kind === 'text';
        const text = isFile ? current.file.content : id === 'readme' ? current.readme : current.node.data?.celebiYaml;
        $(id + 'Section').hidden = !draft && typeof text !== 'string';
        if (id === 'yaml') $(id + 'Box').innerHTML = window.renderCelebiYaml(text || '');
        else $(id + 'Box').textContent = text || '';
        $(id + 'Box').hidden = !!draft;
        $('edit' + message).hidden = !!draft;
        $('edit' + message).disabled = typeof text !== 'string';
        $(id + 'EditForm').hidden = !draft;
        $(id + 'Status').textContent = draft?.error || (draft?.loading ? 'Loading…' : draft?.saving ? 'Saving…' : draft ? 'Unsaved draft'
            : id === 'yaml' && typeof text !== 'string' ? current.node.data?.celebiYamlError || (text === null ? 'No celebi.yaml in this directory.' : 'Loading…') : '');
        if (draft) {
            $(id + 'Editor').value = draft.content;
            $(id + 'Editor').disabled = draft.loading || draft.saving;
            $('save' + message).disabled = draft.loading || draft.saving || !draft.session;
            $('cancel' + message).disabled = draft.loading || draft.saving;
        }
        return isFile;
    }

    function esc(text) {
        const div = document.createElement('div');
        div.textContent = text === null || text === undefined ? '' : String(text);
        return div.innerHTML.replace(/"/g, '&quot;');
    }

    function hideAllSections() {
        for (const id of ['impressionIdSection', 'readmeSection', 'statusSection',
            'predecessorsSection', 'successorsSection', 'yamlSection',
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
        window.clearPdfPreviews();
        current = msg;
        currentSelection += 1;
        renderCollect();
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

        // Render the actual project files and preserve any in-progress drafts.
        let isEditableFile = false;
        for (const file of editableFiles) {
            isEditableFile = renderEditableFile(file) || isEditableFile;
            $(file.id + 'Content').hidden = false;
            $(file.id + 'Arrow').textContent = '▾';
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
            $('previewSection').hidden = isEditableFile;
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
        const style = color ? 'style="background:' + color + '15;color:' + color + ';border-color:' + color + '40"' :
            'style="color:var(--vscode-textLink-foreground);border-color:var(--vscode-textLink-foreground)"';
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
        if (file.kind === 'root') {
            return '<button class="openRootButton" data-local-root-path="' + esc(current.node.id) + '">Open ROOT viewer</button>';
        }
        return '<p class="unsupported">Preview not available for .' + esc(file.ext) + ' files. Open externally to view.</p>';
    }

    function renderResults(msg) {
        if (!current || current.node.celebiType !== 'task') return;
        if (msg.nodeId !== undefined && msg.nodeId !== current.node.id) return;
        window.clearPdfPreviews();
        $('resultsSection').hidden = false;
        if (msg.state === 'loading') {
            $('resultsStatus').textContent = 'Loading results...';
            $('resultGrid').innerHTML = '';
            return;
        }
        if (msg.state === 'error') {
            $('resultsStatus').innerHTML = '<p class="unsupported">' + esc(msg.error) + '</p>';
            $('resultGrid').innerHTML = '';
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
            if (item.is_pdf) {
                return '<div class="resultItem pdfPlot" data-preview-url="' + esc(item.previewUrl || item.url) + '">' +
                    '<img class="resultImage" alt="' + esc(item.name) + ' (first page)" hidden>' +
                    '<div class="pdfStatus unsupported" role="status">Loading PDF…</div>' +
                    '<a class="resultFileLink" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' + esc(item.name) + '</a>' +
                    '</div>';
            }
            if (item.is_plot) {
                return '<div class="resultItem">' +
                    '<img class="resultImage" alt="' + esc(item.name) + '" src="' + esc(item.url) + '" data-url="' + esc(item.url) + '" data-name="' + esc(item.name) + '" loading="lazy">' +
                    '</div>';
            }
            if (/\.root$/i.test(item.name) || /\.root(?:[?#]|$)/i.test(item.url)) {
                return '<div class="resultItem">' +
                    '<div class="resultFile"><span>📊</span><button class="resultFileLink rootFileLink" data-url="' + esc(item.url) + '" data-name="' + esc(item.name) + '">' + esc(item.name) + '</button></div>' +
                    '</div>';
            }
            return '<div class="resultItem">' +
                '<div class="resultFile"><span>📄</span><a class="resultFileLink" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' + esc(item.name) + '</a></div>' +
                '</div>';
        }).join('');
        void window.renderPdfPreviews($('resultGrid'));
    }

    // Impression selector
    $('impressionSelect').addEventListener('change', (e) => {
        if (e.target.value) {
            current.config.impression = e.target.value;
            $('impressionId').textContent = e.target.value;
            renderCollect();
            vscode.postMessage({ type: 'selectImpression', impression: e.target.value });
        }
    });

    $('collectResults').addEventListener('click', () => {
        if ($('collectResults').disabled) return;
        const nodeId = current.node.id;
        const impression = current.config.impression;
        collections.set(collectionKey(nodeId, impression), { pending: true });
        renderCollect();
        vscode.postMessage({ type: 'collectImpression', nodeId, impression });
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
            return;
        }
        const remoteRoot = e.target.closest('.rootFileLink');
        if (remoteRoot) {
            vscode.postMessage({
                type: 'openRemoteRootFile',
                name: remoteRoot.dataset.name,
                url: remoteRoot.dataset.url,
            });
            return;
        }
        const localRoot = e.target.closest('.openRootButton');
        if (localRoot) {
            vscode.postMessage({ type: 'openLocalRootFile', path: localRoot.dataset.localRootPath });
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
    for (const file of editableFiles) {
        const { id, message, drafts } = file;
        $(id + 'Section').querySelector('.collapseHeader').addEventListener('click', () => {
            const box = $(id + 'Content');
            box.hidden = !box.hidden;
            $(id + 'Arrow').textContent = box.hidden ? '▸' : '▾';
        });
        $('edit' + message).addEventListener('click', () => {
            drafts.set(current.node.id, { content: '', loading: true });
            renderEditableFile(file);
            $(id + 'Content').hidden = false;
            $(id + 'Arrow').textContent = '▾';
            vscode.postMessage({ type: 'edit' + message, nodeId: current.node.id });
        });
        $(id + 'Editor').addEventListener('input', () => {
            const draft = drafts.get(current.node.id);
            if (draft) draft.content = $(id + 'Editor').value;
        });
        function save() {
            const draft = drafts.get(current.node.id);
            if (!draft?.session || draft.loading || draft.saving) return;
            draft.saving = true;
            draft.error = '';
            renderEditableFile(file);
            vscode.postMessage({ type: 'save' + message, nodeId: current.node.id, session: draft.session, content: draft.content });
        }
        $('save' + message).addEventListener('click', save);
        $(id + 'Editor').addEventListener('keydown', event => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                save();
            }
        });
        $('cancel' + message).addEventListener('click', () => {
            drafts.delete(current.node.id);
            renderEditableFile(file);
        });
    }
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
        if (msg.type === 'collectResult') {
            collections.set(collectionKey(msg.nodeId, msg.impression), {
                pending: false, message: msg.error ? 'Collect failed: ' + msg.error : 'Collect complete.',
            });
            renderCollect();
        }
        if (msg.type === 'selectNode') renderNode(msg);
        if (msg.type === 'impressionResults') renderResults(msg);
        const file = editableFiles.find(file => msg.type === file.id + 'EditResult');
        if (file) {
            const draft = file.drafts.get(msg.nodeId);
            if (!draft) return;
            draft.loading = draft.saving = false;
            draft.error = msg.error || '';
            if (!msg.error && msg.operation === 'open') {
                draft.content = msg.content;
                draft.session = msg.session;
            }
            if (!msg.error && msg.operation === 'save') {
                file.drafts.delete(msg.nodeId);
                if (current?.node.id === msg.nodeId) {
                    if (file.id === 'readme') current.readme = msg.content;
                    else current.node.data.celebiYaml = msg.content;
                    if (current.file?.kind === 'text') current.file.content = msg.content;
                }
            }
            if (current?.node.id === msg.nodeId) {
                renderEditableFile(file);
                if (!msg.error && msg.operation === 'open') $(file.id + 'Editor').focus();
                if (!msg.error && msg.operation === 'save') $(file.id + 'Status').textContent = 'Saved';
            }
        }
    });
})();
