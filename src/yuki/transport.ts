import type { FetchInit, FetchResponse } from './client';

/** Use VS Code's configured fetch/proxy transport. The extension-development
 * setup sets http.systemCertificatesNode=false to avoid the macOS Keychain
 * stall that originally affected the extension host. */
export async function fetchYuki(url: string, init?: FetchInit): Promise<FetchResponse> {
    return globalThis.fetch(url, init) as unknown as Promise<FetchResponse>;
}
