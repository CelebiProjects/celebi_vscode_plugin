jest.mock('vscode', () => ({}), { virtual: true });

import { parseCelebiProjects } from '../projectSelection';

describe('project selection', () => {
    test('parses projects and the current-project marker', () => {
        expect(parseCelebiProjects([
            '  analysis: /work/analysis',
            '* current: /work/current',
            '  windows: C:\\work\\windows',
            '',
        ].join('\n'))).toEqual([
            { name: 'analysis', path: '/work/analysis', current: false },
            { name: 'current', path: '/work/current', current: true },
            { name: 'windows', path: 'C:\\work\\windows', current: false },
        ]);
    });

    test('ignores the empty-registry message and unrelated output', () => {
        expect(parseCelebiProjects('No registered Celebi projects.\nwarning')).toEqual([]);
    });
});
