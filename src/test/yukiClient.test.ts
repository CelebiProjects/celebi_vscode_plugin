import { YukiClient, normalizeBaseUrl, ImpressionFile } from '../yuki/client';

function jsonResponse(body: unknown, status = 200) {
    return {
        status,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    };
}

describe('normalizeBaseUrl', () => {
    test('keeps http(s) URLs and trims trailing slashes', () => {
        expect(normalizeBaseUrl('http://127.0.0.1:3315/')).toBe('http://127.0.0.1:3315');
        expect(normalizeBaseUrl('https://dite.example.com')).toBe('https://dite.example.com');
    });
    test('prepends http:// for bare host:port', () => {
        expect(normalizeBaseUrl('127.0.0.1:3315')).toBe('http://127.0.0.1:3315');
    });
    test('falls back to default for empty input', () => {
        expect(normalizeBaseUrl('')).toBe('http://127.0.0.1:3315');
    });
});

describe('YukiClient.fetchImpressionResults', () => {
    test('hits /file-status and normalizes plot files with /export fallback URLs', async () => {
        const calls: string[] = [];
        const fetchImpl = (url: string) => {
            calls.push(url);
            return Promise.resolve(jsonResponse([
                { name: 'plot.png', path: 'figs/plot.png', is_plot: true, in_runner: true, in_yuki: false },
                { name: 'out.root', path: 'out.root', in_runner: true, in_yuki: true },
            ]));
        };
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        const items = await client.fetchImpressionResults('proj-uuid', 'impr-1');
        expect(calls).toEqual([
            'http://127.0.0.1:3315/file-status/proj-uuid/impr-1/none?kind=stageout',
        ]);
        expect(items).toHaveLength(2);
        expect(items[0].name).toBe('plot.png');
        expect(items[0].is_plot).toBe(true);
        expect(items[0].url).toBe('http://127.0.0.1:3315/remote-export/proj-uuid/impr-1/figs/plot.png');
        expect(items[1].is_plot).toBe(false);
        expect(items[0].in_runner).toBe(true);
        expect(items[0].in_yuki).toBe(false);
        expect(items[1].in_runner).toBe(true);
        expect(items[1].in_yuki).toBe(true);
    });

    test('plots are sorted before other files', async () => {
        const fetchImpl = () => Promise.resolve(jsonResponse([
            { name: 'b.root' },
            { name: 'a.png' },
        ]));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        const items = await client.fetchImpressionResults('p', 'i');
        expect(items.map((f) => f.name)).toEqual(['a.png', 'b.root']);
    });

    test('coerces {items}/{files}/{impression_data} response shapes', async () => {
        for (const shape of [
            { items: [{ name: 'x.root' }] },
            { files: [{ name: 'x.root' }] },
            { impression_data: [{ name: 'x.root' }] },
        ]) {
            const fetchImpl = () => Promise.resolve(jsonResponse(shape));
            const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
            const items = await client.fetchImpressionResults('p', 'i');
            expect(items).toHaveLength(1);
            expect(items[0].name).toBe('x.root');
        }
    });

    test('resolves server-provided relative file URLs against DITE', async () => {
        const fetchImpl = () => Promise.resolve(jsonResponse([
            { name: 'x.root', url: '/remote-export/p/i/x.root' },
        ]));
        const client = new YukiClient('https://dite.example.test:3315', fetchImpl as never);
        const items = await client.fetchImpressionResults('p', 'i');
        expect(items[0].url).toBe('https://dite.example.test:3315/remote-export/p/i/x.root');
    });

    test('rejects when the server errors', async () => {
        const fetchImpl = () => Promise.reject(new Error('ECONNREFUSED'));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        await expect(client.fetchImpressionResults('p', 'i')).rejects.toThrow();
    });
});

describe('YukiClient status and workflow', () => {
    test('fetchImpressionStatus handles JSON with status_legacy', async () => {
        const fetchImpl = () => Promise.resolve(jsonResponse({ status_legacy: 'finished', details: 'all good' }));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        expect(await client.fetchImpressionStatus('p', 'i')).toEqual({ status: 'finished', details: 'all good' });
    });

    test('fetchImpressionStatus handles plain string responses', async () => {
        const fetchImpl = () => Promise.resolve(jsonResponse('running'));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        expect(await client.fetchImpressionStatus('p', 'i')).toEqual({ status: 'running', details: '' });
    });

    test('fetchImpressionStatus rejects on transport error', async () => {
        const fetchImpl = () => Promise.reject(new Error('down'));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        await expect(client.fetchImpressionStatus('p', 'i')).rejects.toThrow();
    });

    test('fetchImpressionStatus rejects on non-2xx response', async () => {
        const fetchImpl = () => Promise.resolve(jsonResponse('Not Found', 404));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        await expect(client.fetchImpressionStatus('p', 'i')).rejects.toThrow('404');
    });

    test('fetchImpressionWorkflow trims plain text', async () => {
        const fetchImpl = () => Promise.resolve(jsonResponse('machine1 wf-42\n'));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        expect(await client.fetchImpressionWorkflow('p', 'i')).toBe('machine1 wf-42');
    });

    test('fetchImpressionWorkflow rejects on transport error', async () => {
        const fetchImpl = () => Promise.reject(new Error('down'));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        await expect(client.fetchImpressionWorkflow('p', 'i')).rejects.toThrow();
    });

    test('fetchDiteStatus returns connected on ok response', async () => {
        const fetchImpl = () => Promise.resolve(jsonResponse('ok'));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        expect(await client.fetchDiteStatus()).toBe('connected');
    });

    test('fetchDiteStatus returns unconnected on non-ok response', async () => {
        const fetchImpl = () => Promise.resolve(jsonResponse('not ok'));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        expect(await client.fetchDiteStatus()).toBe('unconnected');
    });

    test('fetchDiteStatus returns unconnected on error', async () => {
        const fetchImpl = () => Promise.reject(new Error('down'));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        expect(await client.fetchDiteStatus()).toBe('unconnected');
    });
});

describe('YukiClient timeout', () => {
    test('aborts after 10s', async () => {
        jest.useFakeTimers();
        const fetchImpl = (_url: string, init?: { signal?: AbortSignal }) =>
            new Promise((_, reject) => {
                init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            });
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        const promise = client.fetchImpressionStatus('p', 'i');
        jest.advanceTimersByTime(10_001);
        await expect(promise).rejects.toThrow();
        jest.useRealTimers();
    });
});
