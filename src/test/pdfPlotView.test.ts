import { execFileSync } from 'child_process';
import * as path from 'path';
import { getDetailHtml } from '../webview/detailHtml';


test('PDF results use previews and full-file links; images still load and enlarge', () => {
    const uri = { toString: () => 'https://extension.test/detail.js' };
    const html = getDetailHtml({ cspSource: 'https://extension.test' } as never, uri as never, uri as never, uri as never);
    // Run jsdom in Node directly: its ESM dependencies are outside Jest's CJS loader.
    execFileSync(process.execPath, ['-e', `
    const { JSDOM } = require('jsdom');
    const fs = require('fs');
    const assert = require('node:assert/strict');
    const html = fs.readFileSync(0, 'utf8');
    const dom = new JSDOM(html, { runScripts: 'outside-only' });
    const { window } = dom;
    const messages = [];
    window.acquireVsCodeApi = () => ({ postMessage(message) { messages.push(message); } });
    window.renderCelebiYaml = () => '';
    window.clearPdfPreviews = () => {};
    let rendered = false;
    window.renderPdfPreviews = () => { rendered = true; };
    window.eval(fs.readFileSync('media/detail.js', 'utf8'));
    const send = (data) => window.dispatchEvent(new window.MessageEvent('message', { data }));
    send({ type: 'selectNode', node: { id: 'task', name: 'Task', kind: 'object', celebiType: 'task' }, config: {} });
    send({ type: 'impressionResults', state: 'ready', nodeId: 'task', items: [
        { name: 'fit "one".PDF', is_plot: true, is_pdf: true, url: 'https://server/fit.pdf', previewUrl: 'http://127.0.0.1/preview' },
        { name: 'plot.png', is_plot: true, url: 'https://server/plot.png' },
    ] });
    const card = window.document.querySelector('.pdfPlot');
    assert.equal(card.dataset.previewUrl, 'http://127.0.0.1/preview');
    assert.equal(card.querySelector('a').href, 'https://server/fit.pdf');
    assert.equal(card.querySelector('img').alt, 'fit "one".PDF (first page)');
    assert.equal(card.querySelector('img').hasAttribute('src'), false);
    assert.ok(rendered);
    const image = window.document.querySelector('.resultImage[src]');
    assert.equal(image.src, 'https://server/plot.png');
    image.click();
    assert.equal(window.document.getElementById('lightboxImg').src, image.src);
    const collect = window.document.getElementById('collectResults');
    assert.equal(collect.disabled, true);
    send({ type: 'selectNode', projectUuid: 'p', node: { id: 'task', name: 'Task', kind: 'object', celebiType: 'task' },
        config: { impression: 'latest', impressions: ['old', 'latest'] } });
    const select = window.document.getElementById('impressionSelect');
    select.value = 'old';
    select.dispatchEvent(new window.Event('change'));
    collect.click();
    assert.equal(JSON.stringify(messages.at(-1)), JSON.stringify({ type: 'collectImpression', nodeId: 'task', impression: 'old' }));
    assert.equal(collect.disabled, true);
    const count = messages.length;
    collect.click();
    assert.equal(messages.length, count);
    select.value = 'latest';
    select.dispatchEvent(new window.Event('change'));
    assert.equal(collect.disabled, false);
    send({ type: 'collectResult', nodeId: 'task', impression: 'old', error: 'offline' });
    assert.equal(window.document.getElementById('collectStatus').textContent, '');
    select.value = 'old';
    select.dispatchEvent(new window.Event('change'));
    assert.equal(window.document.getElementById('collectStatus').textContent, 'Collect failed: offline');
    assert.equal(collect.disabled, false);
    dom.window.close();
    `], { input: html, cwd: path.join(__dirname, '../..') });
});
