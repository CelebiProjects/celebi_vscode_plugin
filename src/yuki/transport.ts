import * as http from 'http';
import type { FetchInit, FetchResponse } from './client';

/** VS Code's fetch patch loads system CAs even for plain HTTP. On macOS that
 * can block the extension host in Keychain trust evaluation. HTTP requests
 * need no certificates; use the HTTP transport (including VS Code's proxy
 * support) and leave HTTPS on the existing verified fetch transport.
 */
export async function fetchYuki(url: string, init?: FetchInit, redirects = 0): Promise<FetchResponse> {
    if (new URL(url).protocol !== 'http:') {
        return globalThis.fetch(url, init);
    }
    return new Promise((resolve, reject) => {
        const request = http.request(url, {
            method: init?.method,
            headers: init?.headers,
            signal: init?.signal,
        }, response => {
            response.on('error', reject);
            const status = response.statusCode ?? 0;
            if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
                response.resume();
                if (redirects >= 20) {
                    reject(new Error('Too many DITE redirects'));
                    return;
                }
                const target = new URL(response.headers.location, url);
                const headers = { ...init?.headers };
                if (target.origin !== new URL(url).origin) {
                    for (const key of Object.keys(headers)) {
                        if (['authorization', 'cookie', 'proxy-authorization'].includes(key.toLowerCase())) delete headers[key];
                    }
                }
                const method = status === 303 || ([301, 302].includes(status) && init?.method?.toLowerCase() === 'post')
                    ? 'GET' : init?.method;
                resolve(fetchYuki(target.toString(), { ...init, method, headers }, redirects + 1));
                return;
            }
            response.setEncoding('utf8');
            let body = '';
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => resolve({
                status,
                text: async () => body,
                json: async () => JSON.parse(body),
            }));
        });
        request.on('error', reject);
        request.end();
    });
}
