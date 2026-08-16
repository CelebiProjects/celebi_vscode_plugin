/**
 * Message protocol between the detail webview and the extension host.
 * Pure data shapes + codecs so they can be unit-tested.
 */
import { ImpressionFile } from '../yuki/client';
import { FilePreviewPayload } from '../projectMeta';

export interface NodeDetail {
    id: string;
    name: string;
    kind: 'object' | 'directory' | 'file';
    celebiType: string | null;
    data: Record<string, unknown>;
}

export interface SelectNodePayload {
    type: 'selectNode';
    node: NodeDetail;
    config: Record<string, unknown> | null;
    readme: string | null;
    typeMap: Record<string, string>;
    projectUuid: string;
    file?: FilePreviewPayload;
}

export interface ImpressionResultsPayload {
    type: 'impressionResults';
    state: 'loading' | 'error' | 'ready';
    items: ImpressionFile[];
    status: string;
    details: string;
    workflow: string;
    error: string;
}

export type ExtensionToWebview = SelectNodePayload | ImpressionResultsPayload;

export type WebviewToExtension =
    | { type: 'selectImpression'; impression: string }
    | { type: 'navigateToPath'; path: string };

export function buildSelectNodePayload(
    node: NodeDetail,
    config: Record<string, unknown> | null,
    readme: string | null,
    typeMap: Record<string, string>,
    projectUuid: string,
    file?: FilePreviewPayload
): SelectNodePayload {
    const payload: SelectNodePayload = {
        type: 'selectNode', node, config, readme, typeMap, projectUuid,
    };
    if (file) {
        payload.file = file;
    }
    return payload;
}

export function buildImpressionLoading(): ImpressionResultsPayload {
    return {
        type: 'impressionResults', state: 'loading',
        items: [], status: '', details: '', workflow: '', error: '',
    };
}

export function buildImpressionReady(
    items: ImpressionFile[], status: string, details: string, workflow: string
): ImpressionResultsPayload {
    return {
        type: 'impressionResults', state: 'ready',
        items, status, details, workflow, error: '',
    };
}

export function buildImpressionError(message: string): ImpressionResultsPayload {
    return {
        type: 'impressionResults', state: 'error',
        items: [], status: '', details: '', workflow: '', error: message,
    };
}

/** Validate and decode a message coming from the webview. */
export function parseWebviewMessage(raw: unknown): WebviewToExtension | null {
    if (!raw || typeof raw !== 'object') return null;
    const msg = raw as Record<string, unknown>;
    if (msg.type === 'selectImpression' && typeof msg.impression === 'string') {
        return { type: 'selectImpression', impression: msg.impression };
    }
    if (msg.type === 'navigateToPath' && typeof msg.path === 'string') {
        return { type: 'navigateToPath', path: msg.path };
    }
    return null;
}
