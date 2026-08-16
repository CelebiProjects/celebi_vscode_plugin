/**
 * Unit tests for the pure icon mapping in treeItem.ts.
 *
 * vscode exists only in the extension host, so plain jest cannot load it
 * (plan rule: unit tests must not import vscode). This virtual mock
 * (jest.mock factory with { virtual: true }) provides the tiny API surface
 * treeItem.ts touches at module load — nothing more — so iconFor() stays
 * unit-testable. Mocking a module that does not exist on disk requires the
 * virtual option.
 */
jest.mock('vscode', () => {
    class TreeItem {
        public label: string;
        public collapsibleState?: number;
        constructor(label: string, collapsibleState?: number) {
            this.label = label;
            this.collapsibleState = collapsibleState;
        }
    }
    return {
        TreeItem,
        ThemeIcon: class {},
        ThemeColor: class {},
        TreeItemCollapsibleState: { Collapsed: 0, Expanded: 1, None: 2 },
    };
}, { virtual: true });

import { iconFor } from '../treeItem';

describe('iconFor', () => {
    test('directory icons', () => {
        expect(iconFor('directory', null)).toEqual({ id: 'folder', color: 'charts.yellow' });
    });
    test('file icons', () => {
        expect(iconFor('file', null)).toEqual({ id: 'file', color: 'charts.foreground' });
    });
    test('celebi type icons', () => {
        expect(iconFor('object', 'task')).toEqual({ id: 'gear', color: 'charts.orange' });
        expect(iconFor('object', 'algorithm')).toEqual({ id: 'symbol-operator', color: 'charts.blue' });
        expect(iconFor('object', 'data')).toEqual({ id: 'database', color: 'charts.green' });
        expect(iconFor('object', null)).toEqual({ id: 'symbol-misc', color: 'charts.foreground' });
    });
});
