import { execFileSync } from 'child_process';
import * as path from 'path';
import { getDetailHtml } from '../webview/detailHtml';

test('result filter supports wildcards, literal punctuation, reset and selection changes', () => {
    const uri = { toString: () => 'https://extension.test/detail.js' };
    const html = getDetailHtml({ cspSource: 'https://extension.test' } as never, uri as never, uri as never, uri as never);
    execFileSync(process.execPath, ['-e', `
        const { JSDOM } = require('jsdom');
        const fs = require('fs');
        const assert = require('node:assert/strict');
        const dom = new JSDOM(fs.readFileSync(0, 'utf8'), { runScripts: 'outside-only' });
        const { window } = dom;
        window.acquireVsCodeApi = () => ({ postMessage() {} });
        window.renderCelebiYaml = () => '';
        window.clearPdfPreviews = () => {};
        window.renderPdfPreviews = () => Promise.resolve();
        window.eval(fs.readFileSync('media/detail.js', 'utf8'));
        const send = data => window.dispatchEvent(new window.MessageEvent('message', { data }));
        const select = id => send({ type: 'selectNode', node: { id, name: id, kind: 'object', celebiType: 'task' }, config: {impression: 'current'} });
        select('task');
        send({ type: 'impressionResults', state: 'ready', nodeId: 'task', status: 'finished', items:
            ['plots/bin1.pdf', 'plots/bin12.pdf', 'mc/a[1].yaml', 'step.log'].map(name => ({name, url: 'https://example.test/' + name})) });
        const filter = window.document.getElementById('resultsFilter');
        const names = () => [...window.document.querySelectorAll('#resultGrid .resultFileLink')].map(e => e.textContent);
        const apply = pattern => { filter.value = pattern; filter.dispatchEvent(new window.Event('input')); };
        apply('*.pdf'); assert.deepEqual(names(), ['plots/bin1.pdf', 'plots/bin12.pdf']);
        apply('bin?.pdf'); assert.deepEqual(names(), ['plots/bin1.pdf']);
        apply('mc/a[1].yaml'); assert.deepEqual(names(), ['mc/a[1].yaml']);
        apply('*bin12*'); assert.deepEqual(names(), ['plots/bin12.pdf']);
        apply('*.root'); assert.equal(names().length, 0);
        assert.match(window.document.getElementById('resultsStatus').textContent, /No results match/);
        assert.equal(window.document.getElementById('statusBadge').textContent, 'finished');
        apply(''); assert.equal(names().length, 4);
        const firstCard = window.document.querySelector('#resultGrid .resultItem');
        send({type: 'workflowStatus', nodeId: 'task', impression: 'current', status: 'running', details: ''});
        assert.equal(window.document.getElementById('statusBadge').textContent, 'finished'); // Ignore partial state.
        send({type: 'workflowStatus', nodeId: 'task', impression: 'current', status: 'running', details: '', workflow: 'cern workflow-id'});
        assert.equal(window.document.getElementById('statusBadge').textContent, 'running');
        assert.equal(window.document.getElementById('runnerBadge').textContent, 'cern');
        assert.equal(window.document.getElementById('workflowId').textContent, 'workflow-id');
        send({type: 'workflowStatus', nodeId: 'task', impression: 'obsolete', status: 'failed', details: '', workflow: 'other stale-id'});
        assert.equal(window.document.getElementById('statusBadge').textContent, 'running');
        assert.equal(window.document.getElementById('runnerBadge').textContent, 'cern');
        assert.equal(window.document.getElementById('workflowId').textContent, 'workflow-id');

        assert.equal(window.document.querySelector('#resultGrid .resultItem'), firstCard);
        assert.equal(names().length, 4);

        send({ type: 'selectNode', node: { id: 'task', name: 'task', kind: 'object', celebiType: 'task', data: {statusLoading: true} }, config: {impression: 'saved', impressions: ['saved']} });
        const saved = { type: 'impressionResults', state: 'ready', nodeId: 'task', status: 'finished', items: [{name: 'old.pdf', url: 'https://example.test/old.pdf'}] };
        send(saved);
        assert.deepEqual(names(), ['old.pdf']);
        assert.equal(window.document.getElementById('statusRefreshing').hidden, false);
        assert.equal(window.document.getElementById('resultsSection').hidden, false);
        send({type: 'taskStatus', nodeId: 'task', status: 'new', error: ''});
        assert.deepEqual(names(), ['old.pdf']);
        assert.equal(window.document.getElementById('statusRefreshing').hidden, true);
        assert.equal(window.document.getElementById('statusBadge').textContent, 'finished');
        assert.equal(window.document.getElementById('impressionId').textContent, 'new');
        assert.match(window.document.getElementById('impressionNote').textContent, /saved impression saved/);
        send(saved); // Late result response must not overwrite current task status.
        assert.equal(window.document.getElementById('statusBadge').textContent, 'finished');
        select('another'); apply('*.pdf'); assert.equal(names().length, 0);
        dom.window.close();
    `], { input: html, cwd: path.join(__dirname, '../..') });
});
