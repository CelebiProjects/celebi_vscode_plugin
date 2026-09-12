import {
    buildSelectNodePayload, buildImpressionLoading, buildImpressionReady,
    buildImpressionError, parseWebviewMessage,
    NodeDetail,
} from '../webview/detailMessages';

const node: NodeDetail = {
    id: 'tasks/analysis_1', name: 'analysis_1', kind: 'object',
    celebiType: 'task', data: { parameters: { x: 1 } },
};

describe('buildSelectNodePayload', () => {
    test('assembles the full payload', () => {
        const payload = buildSelectNodePayload(node, { impression: 'imp-1' }, '# README', { 'tasks/analysis_1': 'task' }, 'uuid-1');
        expect(payload).toEqual({
            type: 'selectNode',
            node,
            config: { impression: 'imp-1' },
            readme: '# README',
            typeMap: { 'tasks/analysis_1': 'task' },
            projectUuid: 'uuid-1',
        });
    });

    test('attaches file preview when provided', () => {
        const payload = buildSelectNodePayload(
            { ...node, kind: 'file' }, null, null, {}, '',
            { kind: 'text', content: 'hi' }
        );
        expect(payload.file).toEqual({ kind: 'text', content: 'hi' });
    });
});

describe('impression result payloads', () => {
    test('loading / error / ready states', () => {
        expect(buildImpressionLoading()).toEqual({
            type: 'impressionResults', state: 'loading', items: [], status: '', details: '', workflow: '', error: '',
        });
        expect(buildImpressionError('boom').error).toBe('boom');
        expect(buildImpressionError('boom').state).toBe('error');
        const ready = buildImpressionReady([], 'finished', 'ok', 'm1 wf-1');
        expect(ready.state).toBe('ready');
        expect(ready.status).toBe('finished');
        expect(ready.details).toBe('ok');
        expect(ready.workflow).toBe('m1 wf-1');
        expect(ready.items).toEqual([]);
    });
});

describe('parseWebviewMessage', () => {
    test('collect requires an explicit node and nonempty impression', () => {
        const message = { type: 'collectImpression', nodeId: 'task', impression: 'old-impression' };
        expect(parseWebviewMessage(message)).toEqual(message);
        expect(parseWebviewMessage({ ...message, impression: '' })).toBeNull();
        expect(parseWebviewMessage({ ...message, impression: 1 })).toBeNull();
        expect(parseWebviewMessage({ type: 'collectImpression', impression: 'i' })).toBeNull();
    });
    test('validates inline README editing messages, including empty content', () => {
        expect(parseWebviewMessage({ type: 'editReadme', nodeId: 'task' })).toEqual({ type: 'editReadme', nodeId: 'task' });
        expect(parseWebviewMessage({ type: 'saveReadme', nodeId: 'task', session: 'edit-1', content: '' }))
            .toEqual({ type: 'saveReadme', nodeId: 'task', session: 'edit-1', content: '' });
        expect(parseWebviewMessage({ type: 'saveReadme', nodeId: 'task', content: 'text' })).toBeNull();
        expect(parseWebviewMessage({ type: 'saveReadme', nodeId: 'task', session: 'edit-1', content: 42 })).toBeNull();
    });
    test('parses valid messages', () => {
        expect(parseWebviewMessage({ type: 'selectImpression', impression: 'imp-9' }))
            .toEqual({ type: 'selectImpression', impression: 'imp-9' });
        expect(parseWebviewMessage({ type: 'navigateToPath', path: 'algorithms/reco' }))
            .toEqual({ type: 'navigateToPath', path: 'algorithms/reco' });
        expect(parseWebviewMessage({ type: 'openRemoteRootFile', name: 'out.root', url: 'https://dite/out.root' }))
            .toEqual({ type: 'openRemoteRootFile', name: 'out.root', url: 'https://dite/out.root' });
        expect(parseWebviewMessage({ type: 'openLocalRootFile', path: 'stageout/out.root' }))
            .toEqual({ type: 'openLocalRootFile', path: 'stageout/out.root' });
    });
    test('rejects invalid messages', () => {
        expect(parseWebviewMessage(null)).toBeNull();
        expect(parseWebviewMessage('x')).toBeNull();
        expect(parseWebviewMessage({ type: 'nope' })).toBeNull();
        expect(parseWebviewMessage({ type: 'selectImpression' })).toBeNull();
        expect(parseWebviewMessage({ type: 'selectImpression', impression: 42 })).toBeNull();
        expect(parseWebviewMessage({ type: 'openRemoteRootFile', name: 'out.root' })).toBeNull();
    });
});
