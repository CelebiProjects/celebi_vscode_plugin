import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const script = fs.readFileSync(path.join(__dirname, '../../media/rootFileSource.js'), 'utf8');

function makeSource(fetchMock: jest.Mock, jsroot = { FileProxy: class {} }) {
    const context = vm.createContext({
        JSROOT: jsroot, fetch: fetchMock,
        AbortController, TextDecoder, DataView,
    });
    vm.runInContext(script, context);
    return vm.runInContext('new CelebiRootFileSource("https://example.test/output.root")', context);
}

function rootBytes(size: number): Uint8Array {
    const bytes = new Uint8Array(size);
    bytes.set(new TextEncoder().encode('root'));
    for (let i = 4; i < size; i++) bytes[i] = i % 256;
    return bytes;
}

test('rejects the remote-export HTTP 200 NOTFOUND response before parsing', async () => {
    const source = makeSource(jest.fn().mockResolvedValue(new Response('NOTFOUND')));
    await expect(source.openFile()).rejects.toThrow('no longer available');
});

test('integrates with the bundled JSROOT FileProxy and replaces its null-buffer error', async () => {
    const jsroot = require('../../media/vendor/jsroot.min.js');
    await expect(jsroot.openFile(new TextEncoder().encode('NOTFOUND').buffer))
        .rejects.toThrow("Cannot read properties of null (reading 'getUint8')");
    const source = makeSource(jest.fn().mockResolvedValue(new Response('NOTFOUND')), jsroot);
    await expect(jsroot.openFile(source)).rejects.toThrow('no longer available');
});

test('reads and caches the header, then requests individual ranges at their actual offsets', async () => {
    const bytes = rootBytes(1000);
    const fetchMock = jest.fn(async (_url, options) => {
        const [, start, end] = /bytes=(\d+)-(\d+)/.exec(options.headers.Range)!;
        return new Response(bytes.slice(Number(start), Number(end) + 1), {
            status: 206,
            headers: { 'Content-Range': `bytes ${start}-${end}/1000` },
        });
    });
    const source = makeSource(fetchMock);
    await source.openFile();
    expect(source.getFileSize()).toBe(1000);
    expect((await source.readBuffer(0, 400)).byteLength).toBe(400);
    const data = await source.readBuffer(600, 100);
    expect(data.getUint8(0)).toBe(bytes[600]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Range).toBe('bytes=600-699');
});

test('caches a full HTTP 200 response even when larger than JSROOTs initial range limit', async () => {
    const bytes = rootBytes(200_000);
    const fetchMock = jest.fn().mockResolvedValue(new Response(bytes));
    const source = makeSource(fetchMock);
    await source.openFile();
    const data = await source.readBuffer(150_000, 100);
    expect(data.getUint8(0)).toBe(bytes[150_000]);
    expect(source.getFileSize()).toBe(bytes.length);
    expect(fetchMock).toHaveBeenCalledTimes(1);
});

test.each([
    [new Response('missing', { status: 404 }), 'HTTP 404'],
    [new Response('<html>login</html>'), 'not a ROOT file'],
    [new Response(rootBytes(100)), 'Incomplete ROOT file response'],
    [new Response(rootBytes(400), { status: 206, headers: { 'Content-Range': 'bytes 1-400/1000' } }), 'invalid byte range'],
])('rejects unusable responses with a readable error', async (response, message) => {
    const source = makeSource(jest.fn().mockResolvedValue(response));
    await expect(source.openFile()).rejects.toThrow(message);
});

test('closing the file aborts pending reads and prevents further requests', async () => {
    let signal: AbortSignal | undefined;
    const source = makeSource(jest.fn((_url, options) => {
        signal = options.signal;
        return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('aborted'))));
    }));
    const pending = source.openFile();
    source.closeFile();
    expect(signal!.aborted).toBe(true);
    await expect(pending).rejects.toThrow('aborted');
    await expect(source.readBuffer(0, 400)).rejects.toThrow('cancelled');
});
