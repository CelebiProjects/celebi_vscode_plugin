/**
 * DITE/yuki HTTP client, ported from celebi_ui src/adapters/yuki-api.js.
 * Only the impression-result methods are kept (no runner/workflow management).
 *
 * The transport is injectable so tests can substitute a stub; the real
 * implementation delegates to Node's global fetch.
 */
const DEFAULT_TIMEOUT = 10000;

/** Minimal fetch signature we rely on (kept loose to avoid @types/node fetch variance). */
export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponse>;
export interface FetchInit {
    method?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
}
export interface FetchResponse {
    status: number;
    json(): Promise<unknown>;
    text(): Promise<string>;
}

export interface ImpressionFile {
    name: string;
    path: string;
    type: string;
    is_plot: boolean;
    is_image: boolean;
    url: string;
    project_uuid: string;
    impression: string;
}

export interface ImpressionStatus {
    status: string;
    details: string;
}

export function normalizeBaseUrl(url: string): string {
    const trimmed = (url || '').trim().replace(/\/+$/, '');
    if (!trimmed) return 'http://127.0.0.1:3315';
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) return trimmed;
    return `http://${trimmed}`;
}

function looksLikeImage(name = ''): boolean {
    return /\.(png|jpe?g|gif|bmp|webp|svg|avif)$/i.test(name);
}

function coerceArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.items)) return v.items;
    if (Array.isArray(v.files)) return v.files;
    if (Array.isArray(v.impression_data)) return v.impression_data;
    return [];
}

function encodePath(path: string): string {
    return String(path || '')
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/');
}

/** Build the /export preview URL for an impression file. */
export function buildFileUrl(baseUrl: string, projectUuid: string, impression: string, filePath: string): string {
    const base = baseUrl.replace(/\/+$/, '');
    return `${base}/export/${encodePath(projectUuid)}/${encodePath(impression)}/${encodePath(filePath)}`;
}

export class YukiClient {
    private _baseUrl: string;
    private readonly fetchImpl: FetchLike;

    constructor(baseUrl: string, fetchImpl?: FetchLike) {
        this._baseUrl = normalizeBaseUrl(baseUrl);
        this.fetchImpl = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    }

    get baseUrl(): string {
        return this._baseUrl;
    }

    updateBaseUrl(url: string): void {
        this._baseUrl = normalizeBaseUrl(url);
    }

    private async request(method: 'get' | 'post', path: string): Promise<unknown> {
        const url = `${this._baseUrl}${path}`;
        // 10s timeout applies to injected transports too (keeps tests honest)
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
        try {
            const response = await this.fetchImpl(url, { method, signal: controller.signal });
            if (method === 'get') {
                const text = await response.text();
                try {
                    return JSON.parse(text);
                } catch {
                    return text;
                }
            }
            return response;
        } finally {
            clearTimeout(timer);
        }
    }

    /** Fetch result files for an impression (plots first, then by name). */
    async fetchImpressionResults(projectUuid: string, impression: string, kind = 'stageout'): Promise<ImpressionFile[]> {
        try {
            await this.request('get', `/collect/${encodePath(projectUuid)}/${encodePath(impression)}`).catch(() => null);
            const data = await this.request('get', `/file-status/${encodePath(projectUuid)}/${encodePath(impression)}/none?kind=${kind}`);
            const items = coerceArray(data)
                .map((entry) => this.normalizeImpressionFile(entry, projectUuid, impression))
                .filter((x): x is ImpressionFile => x !== null)
                .sort((a, b) => {
                    if (Boolean(a.is_plot) !== Boolean(b.is_plot)) return a.is_plot ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
            return items;
        } catch {
            return [];
        }
    }

    private normalizeImpressionFile(entry: unknown, projectUuid: string, impression: string): ImpressionFile | null {
        if (!entry || typeof entry !== 'object') return null;
        const e = entry as Record<string, unknown>;
        const name = String(e.name || e.filename || e.path || e.file || e.label || '');
        const isPlot = Boolean(e.is_plot ?? e.is_image ?? e.isImage)
            || e.type === 'plot'
            || looksLikeImage(name);
        const filePath = String(e.path || e.filename || name);
        return {
            name,
            path: filePath,
            type: String(e.type || (isPlot ? 'plot' : 'data')),
            is_plot: isPlot,
            is_image: isPlot,
            url: String(e.url || e.href || e.src || buildFileUrl(this._baseUrl, projectUuid, impression, filePath)),
            project_uuid: String(e.project_uuid || projectUuid),
            impression: String(e.impression || impression),
        };
    }

    /** Fetch job status for an impression (DITE /status endpoint). */
    async fetchImpressionStatus(projectUuid: string, impression: string): Promise<ImpressionStatus> {
        try {
            const data = await this.request('get', `/status/${encodePath(projectUuid)}/${encodePath(impression)}`);
            if (typeof data === 'string') return { status: data, details: '' };
            const obj = (data ?? {}) as Record<string, unknown>;
            return {
                status: String(obj.status_legacy || obj.status || ''),
                details: String(obj.details || obj.message || obj.error || ''),
            };
        } catch {
            return { status: '', details: '' };
        }
    }

    /** Fetch workflow info for an impression (plain text "machine workflow_id"). */
    async fetchImpressionWorkflow(projectUuid: string, impression: string): Promise<string> {
        try {
            const data = await this.request('get', `/workflow/${encodePath(projectUuid)}/${encodePath(impression)}`);
            return typeof data === 'string' ? data.trim() : '';
        } catch {
            return '';
        }
    }
}
