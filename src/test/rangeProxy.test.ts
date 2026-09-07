import * as http from 'http';
import { AddressInfo } from 'net';
import { RootRangeProxy } from '../rootViewer/rangeProxy';

function listen(server: http.Server): Promise<number> {
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
    });
}

function close(server: http.Server): Promise<void> {
    return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

describe('RootRangeProxy', () => {
    test('forwards byte ranges and streams a 206 response', async () => {
        let receivedRange = '';
        const upstream = http.createServer((request, response) => {
            receivedRange = request.headers.range || '';
            response.writeHead(206, {
                'Accept-Ranges': 'bytes',
                'Content-Range': 'bytes 2-5/10',
                'Content-Length': '4',
                'Content-Type': 'application/octet-stream',
            });
            response.end('2345');
        });
        const port = await listen(upstream);
        const proxy = new RootRangeProxy();
        const source = await proxy.register(`http://127.0.0.1:${port}/large.root`, 'large.root');

        const response = await fetch(source.url, { headers: { Range: 'bytes=2-5' } });
        expect(response.status).toBe(206);
        expect(await response.text()).toBe('2345');
        expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
        expect(receivedRange).toBe('bytes=2-5');

        source.dispose();
        proxy.dispose();
        await close(upstream);
    });

    test('forwards a streamed response when upstream ignores Range', async () => {
        const upstream = http.createServer((_request, response) => {
            response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            response.end('streamed ROOT content');
        });
        const port = await listen(upstream);
        const proxy = new RootRangeProxy();
        const source = await proxy.register(`http://127.0.0.1:${port}/large.root`, 'large.root');

        const response = await fetch(source.url, { headers: { Range: 'bytes=0-1023' } });
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('streamed ROOT content');

        source.dispose();
        proxy.dispose();
        await close(upstream);
    });

    test('requires a Range header for GET requests', async () => {
        const proxy = new RootRangeProxy();
        const source = await proxy.register('http://127.0.0.1:1/large.root', 'large.root');
        const response = await fetch(source.url);
        expect(response.status).toBe(416);
        proxy.dispose();
    });
});
