import { getDetailHtml } from '../webview/detailHtml';

const stubWebview = {
    cspSource: 'vscode-webview://csp',
};

describe('getDetailHtml', () => {
    test('contains CSP allowing http images and nonce script', () => {
        const html = getDetailHtml(stubWebview as never);
        expect(html).toContain('default-src \'none\'');
        expect(html).toContain('img-src');
        expect(html).toContain('http:');
        expect(html).toContain('https:');
        expect(html).toContain('data:');
        expect(html).toContain("script-src 'nonce-");
    });
    test('renders all DetailPanel sections', () => {
        const html = getDetailHtml(stubWebview as never);
        for (const marker of [
            'id="emptyState"', 'id="typeLabel"', 'id="impressionSelect"',
            'id="readmeSection"', 'id="statusSection"', 'id="predecessorsSection"',
            'id="successorsSection"', 'id="objectInfoSection"', 'id="resultsSection"',
            'id="fileInfoSection"', 'id="previewSection"', 'id="lightbox"',
        ]) {
            expect(html).toContain(marker);
        }
    });
    test('contains acquireVsCodeApi wiring', () => {
        const html = getDetailHtml(stubWebview as never);
        expect(html).toContain('acquireVsCodeApi()');
        expect(html).toContain('selectImpression');
        expect(html).toContain('navigateToPath');
    });
});
