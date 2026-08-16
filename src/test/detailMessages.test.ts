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
    test('parses valid messages', () => {
        expect(parseWebviewMessage({ type: 'selectImpression', impression: 'imp-9' }))
            .toEqual({ type: 'selectImpression', impression: 'imp-9' });
        expect(parseWebviewMessage({ type: 'navigateToPath', path: 'algorithms/reco' }))
            .toEqual({ type: 'navigateToPath', path: 'algorithms/reco' });
    });
    test('rejects invalid messages', () => {
        expect(parseWebviewMessage(null)).toBeNull();
        expect(parseWebviewMessage('x')).toBeNull();
        expect(parseWebviewMessage({ type: 'nope' })).toBeNull();
        expect(parseWebviewMessage({ type: 'selectImpression' })).toBeNull();
        expect(parseWebviewMessage({ type: 'selectImpression', impression: 42 })).toBeNull();
    });
});
