import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import { AddressInfo } from 'net';
import type * as vscode from 'vscode';

interface RegisteredSource {
    url: URL;
    name: string;
}

export interface ProxiedRootSource extends vscode.Disposable {
    readonly url: string;
}

/**
 * Loopback-only HTTP bridge used by JSROOT.
 *
 * JSROOT reads files with HTTP byte ranges. The bridge forwards those ranges
 * to DITE while keeping the webview same-origin and avoiding a full download.
 */
export class RootRangeProxy implements vscode.Disposable {
    private readonly sources = new Map<string, RegisteredSource>();
    private readonly server: http.Server;
    private listening: Promise<number> | undefined;

    constructor() {
        this.server = http.createServer((request, response) => {
            void this.handleRequest(request, response);
        });
    }

    async register(url: string, name: string): Promise<ProxiedRootSource> {
        const upstream = new URL(url);
        if (upstream.protocol !== 'http:' && upstream.protocol !== 'https:') {
            throw new Error(`Unsupported ROOT file URL protocol: ${upstream.protocol}`);
        }

        const port = await this.ensureListening();
        const token = crypto.randomBytes(24).toString('hex');
        this.sources.set(token, { url: upstream, name });
        const proxyUrl = `http://127.0.0.1:${port}/${token}/${encodeURIComponent(name || 'result.root')}`;
        return {
            url: proxyUrl,
            dispose: () => { this.sources.delete(token); },
        };
    }

    private ensureListening(): Promise<number> {
        if (this.listening) return this.listening;
        this.listening = new Promise<number>((resolve, reject) => {
            const onError = (error: Error) => {
                this.server.off('listening', onListening);
                this.listening = undefined;
                reject(error);
            };
            const onListening = () => {
                this.server.off('error', onError);
                resolve((this.server.address() as AddressInfo).port);
            };
            this.server.once('error', onError);
            this.server.once('listening', onListening);
            this.server.listen(0, '127.0.0.1');
        });
        return this.listening;
    }

    private async handleRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
        console.log('[Celebi timing]', JSON.stringify({
            at: new Date().toISOString(), event: 'root.proxy.request',
            method: request.method, range: request.headers.range || '', url: request.url || '',
        }));
        this.setCorsHeaders(response);
        if (request.method === 'OPTIONS') {
            response.writeHead(204);
            response.end();
            return;
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            this.fail(response, 405, 'Only GET and HEAD are supported.');
            return;
        }

        const token = (request.url || '').split('/')[1];
        const source = token ? this.sources.get(token) : undefined;
        if (!source) {
            this.fail(response, 404, 'ROOT stream is no longer available.');
            return;
        }

        // A non-range GET could cause a multi-gigabyte transfer. JSROOT normally
        // starts with a range request, so reject accidental full downloads from
        // the proxy itself. Some Yuki remote-export backends cannot seek and
        // answer a ranged request with a streamed 200; that response is handled
        // below so those files remain viewable.
        const range = request.headers.range;
        if (request.method === 'GET' && !range) {
            this.fail(response, 416, 'A byte-range request is required for remote ROOT files.');
            return;
        }

        this.forward(source.url, request.method, range, response, 0);
    }

    private forward(
        url: URL,
        method: string,
        range: string | undefined,
        response: http.ServerResponse,
        redirects: number,
    ): void {
        const transport = url.protocol === 'https:' ? https : http;
        const headers: http.OutgoingHttpHeaders = {
            accept: 'application/octet-stream',
        };
        if (range) headers.range = range;

        const upstream = transport.request(url, { method, headers }, (incoming) => {
            const status = incoming.statusCode || 502;
            console.log('[Celebi timing]', JSON.stringify({
                at: new Date().toISOString(), event: 'root.proxy.upstream', method,
                status, range: range || '', url: url.toString(),
            }));
            const location = incoming.headers.location;
            if (location && [301, 302, 303, 307, 308].includes(status)) {
                incoming.resume();
                if (redirects >= 5) {
                    this.fail(response, 502, 'Too many redirects while opening the ROOT file.');
                    return;
                }
                this.forward(new URL(location, url), method, range, response, redirects + 1);
                return;
            }

            const forwardedHeaders: http.OutgoingHttpHeaders = {};
            for (const key of [
                'accept-ranges', 'content-length', 'content-range', 'content-type',
                'etag', 'last-modified',
            ]) {
                const value = incoming.headers[key];
                if (value !== undefined) forwardedHeaders[key] = value;
            }
            forwardedHeaders['access-control-allow-origin'] = '*';
            forwardedHeaders['access-control-expose-headers'] =
                'Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified';
            response.writeHead(status, forwardedHeaders);
            incoming.pipe(response);
        });

        // Remote-export may need time to open an SSH-backed file before the
        // first bytes arrive. Keep this above the webview's loading deadline.
        upstream.setTimeout(120_000, () => {
            upstream.destroy(new Error('Timed out while reading the remote ROOT file.'));
        });
        upstream.on('error', (error) => {
            console.log('[Celebi timing]', JSON.stringify({
                at: new Date().toISOString(), event: 'root.proxy.error', message: error.message,
            }));
            if (!response.headersSent) this.fail(response, 502, error.message);
            else response.destroy(error);
        });
        response.on('close', () => upstream.destroy());
        upstream.end();
    }

    private setCorsHeaders(response: http.ServerResponse): void {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Headers', 'Range');
        response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        response.setHeader('Access-Control-Expose-Headers',
            'Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified');
    }

    private fail(response: http.ServerResponse, status: number, message: string): void {
        if (response.headersSent) return;
        response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(message);
    }

    dispose(): void {
        this.sources.clear();
        this.server.close();
    }
}
