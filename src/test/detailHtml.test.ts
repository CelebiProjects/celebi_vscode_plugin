import { getDetailHtml } from '../webview/detailHtml';

const stubWebview = {
    cspSource: 'vscode-webview://csp',
    asWebviewUri: (uri: { toString: () => string }) => uri.toString(),
};

const stubScriptUri = { toString: () => 'file:///ext/media/detail.js' };

describe('getDetailHtml', () => {
    test('contains CSP allowing http images and nonce script', () => {
        const html = getDetailHtml(stubWebview as never, stubScriptUri as never, stubScriptUri as never);
        expect(html).toContain('default-src \'none\'');
        expect(html).toContain('img-src');
        expect(html).toContain('http:');
        expect(html).toContain('https:');
        expect(html).toContain('data:');
        expect(html).toContain('script-src ');
        expect(html).toContain('nonce-');
    });
    test('renders all DetailPanel sections', () => {
        const html = getDetailHtml(stubWebview as never, stubScriptUri as never, stubScriptUri as never);
        for (const marker of [
            'id="emptyState"', 'id="typeLabel"', 'id="impressionSelect"',
            'id="readmeSection"', 'id="statusSection"', 'id="predecessorsSection"',
            'id="successorsSection"', 'id="yamlSection"', 'id="resultsSection"',
            'id="fileInfoSection"', 'id="previewSection"', 'id="lightbox"',
        ]) {
            expect(html).toContain(marker);
        }
    });
    test('loads detail script from external file', () => {
        const html = getDetailHtml(stubWebview as never, stubScriptUri as never, stubScriptUri as never);
        expect(html).toContain('src="file:///ext/media/detail.js"');
        expect(html).toContain('<script');
        expect(html).not.toContain('acquireVsCodeApi()');
    });
    test('does not contain inline onerror handlers', () => {
        const html = getDetailHtml(stubWebview as never, stubScriptUri as never, stubScriptUri as never);
        expect(html).not.toContain('onerror=');
    });
});
