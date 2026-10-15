import * as path from 'path';
import { resolveTreeItemPath, resolveTreeItemRelativePath } from '../tree/treePath';

describe('resolveTreeItemPath', () => {
    const root = path.resolve('/project');

    test('returns an absolute path for a real tree item', () => {
        expect(resolveTreeItemPath(root, 'tasks/analysis/result.txt'))
            .toBe(path.join(root, 'tasks', 'analysis', 'result.txt'));
    });

    test('returns a project-relative path for a real tree item', () => {
        expect(resolveTreeItemRelativePath(root, 'tasks/analysis/result.txt'))
            .toBe(path.join('tasks', 'analysis', 'result.txt'));
    });

    test('rejects synthetic and escaping paths', () => {
        expect(resolveTreeItemPath(root, '__dite_status__')).toBeUndefined();
        expect(resolveTreeItemPath(root, '__error__tasks')).toBeUndefined();
        expect(resolveTreeItemPath(root, '../outside')).toBeUndefined();
        expect(resolveTreeItemPath(root, '')).toBeUndefined();
        expect(resolveTreeItemRelativePath(root, '../outside')).toBeUndefined();
    });
});
