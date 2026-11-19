import { execFileSync } from 'child_process';
import * as path from 'path';
import { getDetailHtml } from '../webview/detailHtml';

test('missing text results show an error and can be retried', () => {
    const uri = { toString: () => 'https://extension.test/detail.js' };
    const html = getDetailHtml({ cspSource: 'https://extension.test' } as never, uri as never, uri as never, uri as never);
    execFileSync(process.execPath, ['-e', `
    const { JSDOM } = require('jsdom');
    const fs = require('fs');
    const assert = require('node:assert/strict');
    (async () => {
        const dom = new JSDOM(fs.readFileSync(0, 'utf8'), { runScripts: 'outside-only' });
        const { window } = dom;
        window.acquireVsCodeApi = () => ({ postMessage() {} });
        window.renderCelebiYaml = () => '';
        window.clearPdfPreviews = () => {};
        window.renderPdfPreviews = () => Promise.resolve();
        let body = 'NOTFOUND';
        window.fetch = async () => ({ ok: true, text: async () => body });
        window.eval(fs.readFileSync('media/detail.js', 'utf8'));
        const send = data => window.dispatchEvent(new window.MessageEvent('message', { data }));
        send({ type: 'selectNode', node: { id: 'task', name: 'Task', kind: 'object', celebiType: 'task' }, config: {} });
        send({ type: 'impressionResults', state: 'ready', nodeId: 'task', items: [
            { name: 'mc/bin0.yaml', url: 'https://server/mc/bin0.yaml', previewUrl: 'http://127.0.0.1/preview' }
        ] });
        const button = window.document.querySelector('.textFileLink');
        button.click();
        await new Promise(setImmediate);
        const card = window.document.querySelector('.textResult');
        assert.equal(card.querySelector('.textResultPreview').hidden, true);
        assert.match(card.querySelector('.textResultStatus').textContent, /Yuki could not read this file/);
        assert.notEqual(card.dataset.loaded, 'true');
        body = 'value: 42';
        button.click();
        await new Promise(setImmediate);
        assert.equal(card.querySelector('.textResultPreview').textContent, body);
        assert.equal(card.querySelector('.textResultStatus').hidden, true);
        dom.window.close();
    })().catch(error => { console.error(error); process.exitCode = 1; });
    `], { input: html, cwd: path.join(__dirname, '../..') });
});

test('text results expand into a wrapped preview that preserves newlines', () => {
    const uri = { toString: () => 'https://extension.test/detail.js' };
    const html = getDetailHtml({ cspSource: 'https://extension.test' } as never, uri as never, uri as never, uri as never);
    execFileSync(process.execPath, ['-e', `
    const { JSDOM } = require('jsdom');
    const fs = require('fs');
    const assert = require('node:assert/strict');
    const html = fs.readFileSync(0, 'utf8');
    const dom = new JSDOM(html, { runScripts: 'outside-only' });
    const { window } = dom;
    window.acquireVsCodeApi = () => ({ postMessage() {} });
    window.renderCelebiYaml = () => '';
    window.clearPdfPreviews = () => {};
    window.renderPdfPreviews = () => Promise.resolve();
    window.fetch = async url => {
        assert.equal(url, 'http://127.0.0.1/preview/result.txt');
        return { ok: true, text: async () => 'first line\\nsecond line\\n' };
    };
    window.eval(fs.readFileSync('media/detail.js', 'utf8'));
    const send = data => window.dispatchEvent(new window.MessageEvent('message', { data }));
    send({ type: 'selectNode', node: { id: 'task', name: 'Task', kind: 'object', celebiType: 'task' }, config: {} });
    send({ type: 'impressionResults', state: 'ready', nodeId: 'task', items: [
        { name: 'result.txt', url: 'https://server/result.txt', previewUrl: 'http://127.0.0.1/preview/result.txt' },
        { name: 'job.log', url: 'https://server/job.log', previewUrl: 'http://127.0.0.1/preview/job.log' }
    ] });
    const buttons = window.document.querySelectorAll('.textFileLink');
    assert.equal(buttons.length, 2);
    assert.equal(buttons[1].textContent, 'job.log');
    const button = buttons[0];
    button.click();
    setImmediate(() => {
        const preview = window.document.querySelector('.textResultPreview');
        assert.equal(preview.hidden, false);
        assert.equal(preview.textContent, 'first line\\nsecond line\\n');
        assert.equal(button.getAttribute('aria-expanded'), 'true');
        assert.match(window.document.querySelector('style').textContent, /white-space:\\s*pre-wrap/);
        dom.window.close();
    });
    `], { input: html, cwd: path.join(__dirname, '../..') });
});
