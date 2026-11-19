jest.mock('vscode', () => ({
    Uri: { parse: (url: string) => ({ toString: () => url }), file: (url: string) => url },
    ViewColumn: { One: 1 },
    env: { asExternalUri: jest.fn() },
    window: { createWebviewPanel: jest.fn() },
}), { virtual: true });
jest.mock('../rootViewer/rangeProxy', () => ({
    RootRangeProxy: jest.fn().mockImplementation(() => ({ register: jest.fn(), dispose: jest.fn() })),
}));

import * as vscode from 'vscode';
import { RootRangeProxy } from '../rootViewer/rangeProxy';
import { DetailWebviewProvider, DetailWebviewCallbacks } from '../webview/detailWebview';
import { buildImpressionLoading, buildImpressionReady } from '../webview/detailMessages';
import { ImpressionFile } from '../yuki/client';

const flush = () => new Promise(resolve => setImmediate(resolve));

test('forwards image, PDF and text previews and releases sources on selection change', async () => {
    const postMessage = jest.fn();
    const panel = {
        webview: { asWebviewUri: () => 'asset', postMessage, onDidReceiveMessage: jest.fn() },
        reveal: jest.fn(), onDidDispose: jest.fn(), dispose: jest.fn(),
    };
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(panel);
    (vscode.env.asExternalUri as jest.Mock).mockImplementation(async uri => ({
        toString: () => uri.toString().replace('http://127.0.0.1:1234', 'https://forwarded.test'),
    }));
    const provider = new DetailWebviewProvider({} as DetailWebviewCallbacks, '/extension');
    const proxy = (RootRangeProxy as jest.Mock).mock.results.at(-1)!.value;
    const sources: { url: string; dispose: jest.Mock }[] = [];
    proxy.register.mockImplementation(async (_url: string, name: string) => {
        const source = { url: `http://127.0.0.1:1234/${name}`, dispose: jest.fn() };
        sources.push(source);
        return source;
    });
    const items = ['plot.png', 'plot.pdf', 'result.txt'].map(name => ({
        name, path: name, url: `http://server/${name}`,
        is_plot: name !== 'result.txt', is_image: name.endsWith('.png'), is_pdf: name.endsWith('.pdf'),
    } as ImpressionFile));
    provider.show(buildImpressionReady(items, '', '', ''));
    await flush();
    expect(postMessage.mock.calls.at(-1)[0].items.map((item: ImpressionFile) => item.previewUrl))
        .toEqual(items.map(item => `https://forwarded.test/${item.name}`));
    provider.show(buildImpressionLoading());
    expect(sources.every(source => source.dispose.mock.calls.length === 1)).toBe(true);

    (vscode.env.asExternalUri as jest.Mock).mockRejectedValueOnce(new Error('Forwarding failed'));
    provider.show(buildImpressionReady([items[0]], '', '', ''));
    await flush();
    expect(sources.at(-1)!.dispose).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls.at(-1)[0].items[0].previewUrl).toBeUndefined();

    let resolveForward!: (uri: unknown) => void;
    (vscode.env.asExternalUri as jest.Mock).mockImplementationOnce(() => new Promise(resolve => {
        resolveForward = resolve;
    }));
    const before = postMessage.mock.calls.length;
    provider.show(buildImpressionReady([items[0]], '', '', ''));
    expect(postMessage.mock.calls.length).toBe(before + 1);
    expect(postMessage.mock.calls.at(-1)[0].items[0].name).toBe('plot.png');
    await flush();
    // The forwarding promise is still pending, but file links are already sent.
    expect(postMessage.mock.calls.length).toBe(before + 1);
    provider.show(buildImpressionLoading());
    const messages = postMessage.mock.calls.length;
    resolveForward({ toString: () => 'https://forwarded.test/stale' });
    await flush();
    expect(postMessage).toHaveBeenCalledTimes(messages);
    expect(sources.at(-1)!.dispose).toHaveBeenCalledTimes(1);
    provider.dispose();
});
