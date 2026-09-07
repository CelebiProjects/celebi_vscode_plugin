import * as http from 'http';
import { AddressInfo } from 'net';
import { fetchYuki } from '../yuki/transport';
import { YukiClient } from '../yuki/client';

let server: http.Server;
let baseUrl: string;
beforeEach(async () => {
    server = http.createServer((request, response) => {
        switch (request.url) {
            case '/dite-status': response.end('ok'); break;
            case '/status/p/i': response.end('{"status":"finished"}'); break;
            case '/redirect': response.writeHead(302, { location: '/dite-status' }); response.end(); break;
            case '/hang': response.writeHead(200); response.write('partial'); break;
            default: response.writeHead(404); response.end('missing');
        }
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
    jest.restoreAllMocks();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
});

test('real HTTP health and JSON requests work without touching the patched global fetch', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('system CA scan'); });
    const client = new YukiClient(baseUrl);
    expect(await client.fetchDiteStatus()).toBe('connected');
    expect(await client.fetchImpressionStatus('p', 'i')).toEqual({ status: 'finished', details: '' });
    expect(fetch).not.toHaveBeenCalled();
});

test('HTTP redirects are followed and error statuses reach the client', async () => {
    expect(await (await fetchYuki(baseUrl + '/redirect')).text()).toBe('ok');
    await expect(new YukiClient(baseUrl).fetchImpressionStatus('missing', 'i')).rejects.toThrow('404');
});

test('abort cancels a response whose body never finishes', async () => {
    const controller = new AbortController();
    const promise = fetchYuki(baseUrl + '/hang', { signal: controller.signal });
    const rejected = expect(promise).rejects.toThrow();
    server.once('request', () => controller.abort());
    await rejected;
});

test('HTTPS keeps the existing fetch transport and its signal', async () => {
    const response = new Response('ok');
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    const controller = new AbortController();
    expect(await fetchYuki('https://dite.example.test/dite-status', { signal: controller.signal })).toBe(response);
    expect(fetch).toHaveBeenCalledWith('https://dite.example.test/dite-status', { signal: controller.signal });
});
