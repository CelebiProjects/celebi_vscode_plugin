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
    selection?: number;
    nodeId?: string;
}

export interface ReadmeEditResult {
    type: 'readmeEditResult' | 'yamlEditResult';
    operation: 'open' | 'save';
    nodeId: string;
    session?: string;
    content?: string;
    error?: string;
}

export type ExtensionToWebview = SelectNodePayload | ImpressionResultsPayload | ReadmeEditResult;

export type WebviewToExtension =
    | { type: 'selectImpression'; impression: string }
    | { type: 'navigateToPath'; path: string }
    | { type: 'openRemoteRootFile'; name: string; url: string }
    | { type: 'openLocalRootFile'; path: string }
    | { type: 'editReadme'; nodeId: string }
    | { type: 'saveReadme'; nodeId: string; session: string; content: string }
    | { type: 'editYaml'; nodeId: string }
    | { type: 'saveYaml'; nodeId: string; session: string; content: string };

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

export function buildImpressionLoading(selection?: number, nodeId?: string): ImpressionResultsPayload {
    return {
        type: 'impressionResults', state: 'loading',
        items: [], status: '', details: '', workflow: '', error: '', selection, nodeId,
    };
}

export function buildImpressionReady(
    items: ImpressionFile[], status: string, details: string, workflow: string, selection?: number, nodeId?: string
): ImpressionResultsPayload {
    return {
        type: 'impressionResults', state: 'ready',
        items, status, details, workflow, error: '', selection, nodeId,
    };
}

export function buildImpressionError(message: string, selection?: number, nodeId?: string): ImpressionResultsPayload {
    return {
        type: 'impressionResults', state: 'error',
        items: [], status: '', details: '', workflow: '', error: message, selection, nodeId,
    };
}

/** Validate and decode a message coming from the webview. */
export function parseWebviewMessage(raw: unknown): WebviewToExtension | null {
    if (!raw || typeof raw !== 'object') return null;
    const msg = raw as Record<string, unknown>;
    if ((msg.type === 'editReadme' || msg.type === 'editYaml') && typeof msg.nodeId === 'string') {
        return { type: msg.type, nodeId: msg.nodeId };
    }
    if ((msg.type === 'saveReadme' || msg.type === 'saveYaml') && typeof msg.nodeId === 'string'
        && typeof msg.session === 'string' && typeof msg.content === 'string') {
        return { type: msg.type, nodeId: msg.nodeId, session: msg.session, content: msg.content };
    }
    if (msg.type === 'selectImpression' && typeof msg.impression === 'string') {
        return { type: 'selectImpression', impression: msg.impression };
    }
    if (msg.type === 'navigateToPath' && typeof msg.path === 'string') {
        return { type: 'navigateToPath', path: msg.path };
    }
    if (msg.type === 'openRemoteRootFile'
        && typeof msg.name === 'string' && typeof msg.url === 'string') {
        return { type: 'openRemoteRootFile', name: msg.name, url: msg.url };
    }
    if (msg.type === 'openLocalRootFile' && typeof msg.path === 'string') {
        return { type: 'openLocalRootFile', path: msg.path };
    }
    return null;
}
