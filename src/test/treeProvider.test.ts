jest.mock('vscode', () => ({
    TreeItem: class { constructor(public label: string, public collapsibleState: number) {} },
    ThemeIcon: class {}, ThemeColor: class {},
    EventEmitter: class {
        private listeners: Array<(...args: any[]) => void> = [];
        event = (listener: (...args: any[]) => void) => {
            this.listeners.push(listener);
            return { dispose: () => { this.listeners = this.listeners.filter(fn => fn !== listener); } };
        };
        fire = (...args: any[]) => { this.listeners.forEach(listener => listener(...args)); };
    },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
}), { virtual: true });
jest.mock('../celebiScript', () => ({ runCelebiPython: jest.fn() }));

import { runCelebiPython, ChildrenData } from '../celebiScript';
import { CelebiTreeProvider } from '../tree/treeProvider';
import { affectsTree } from '../tree/treeChanges';

const run = jest.mocked(runCelebiPython);
const layer = (id: string, kind: 'directory' | 'file' | 'object' = 'directory'): ChildrenData => ({
    entries: [{ path: id, name: id.split('/').pop()!, kind,
        type: kind === 'object' ? 'task' : null, absolutePath: '/project/' + id }],
});
beforeEach(() => run.mockReset());

test('completing or failing a children request does not invalidate the view fetching it', async () => {
    const provider = new CelebiTreeProvider('/project');
    const changed = jest.fn();
    provider.onDidChangeTreeData(changed);
    run.mockResolvedValueOnce(layer('tasks')).mockRejectedValueOnce(new Error('offline'));
    const [task] = await provider.getChildren();
    await provider.getChildren(task);
    expect(changed).not.toHaveBeenCalled();
    await provider.refresh();
    expect(changed).toHaveBeenCalledTimes(1);
});

test('loads only the requested layer and shares simultaneous requests and cached results', async () => {
    const provider = new CelebiTreeProvider('/project');
    run.mockResolvedValueOnce(layer('tasks')).mockResolvedValueOnce(layer('tasks/job', 'object'));
    const [first, second] = await Promise.all([provider.getChildren(), provider.getChildren()]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(first[0]).toBe(second[0]);
    expect(first[0].id).toBe('tasks');
    expect(run).toHaveBeenNthCalledWith(1, 'children', '/project', '/project');
    const children = await provider.getChildren(first[0]);
    expect(run).toHaveBeenNthCalledWith(2, 'children', '/project', '/project/tasks');
    expect(provider.getParent(children[0])).toBe(first[0]);
    expect(provider.getTypeMap()).toEqual({ 'tasks/job': 'task' });
    await provider.getChildren(first[0]);
    expect(run).toHaveBeenCalledTimes(2);
});

test('refresh invalidates without scanning; stale responses cannot repopulate the cache', async () => {
    const provider = new CelebiTreeProvider('/project');
    let finish!: (data: ChildrenData) => void;
    run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const oldRequest = provider.getChildren();
    await provider.refresh();
    expect(run).toHaveBeenCalledTimes(1);
    run.mockResolvedValueOnce(layer('new'));
    const current = await provider.getChildren();
    finish(layer('old'));
    expect(await oldRequest).toEqual([]);
    expect(provider.getItemById('old')).toBeUndefined();
    expect(await provider.getChildren()).toEqual(current);
    expect(run).toHaveBeenCalledTimes(2);
});

test('navigation loads unexpanded ancestors and file nodes do not run Python', async () => {
    const provider = new CelebiTreeProvider('/project');
    run.mockResolvedValueOnce(layer('tasks')).mockResolvedValueOnce(layer('tasks/a.py', 'file'));
    const file = await provider.resolveItem('tasks/a.py');
    expect(file?.nodeId).toBe('tasks/a.py');
    expect(await provider.getChildren(file)).toEqual([]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(await provider.resolveItem('../outside')).toBeUndefined();
});

test('failed expansion can be retried', async () => {
    const provider = new CelebiTreeProvider('/project');
    run.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(layer('tasks'));
    expect((await provider.getChildren())[0].nodeId).toBe('__error__');
    expect((await provider.getChildren())[0].nodeId).toBe('tasks');
});

test('watcher ignores output churn and content edits but tracks visible structure and object metadata', () => {
    expect(affectsTree('impression_data/task/output.root', 'structure')).toBe(false);
    expect(affectsTree('.celebi/impressions/abc/config.json', 'change')).toBe(false);
    expect(affectsTree('.git/index', 'change')).toBe(false);
    expect(affectsTree('task/log.txt', 'change')).toBe(false);
    expect(affectsTree('task/code.py', 'structure')).toBe(true);
    expect(affectsTree('task/celebi.yaml', 'change')).toBe(true);
    expect(affectsTree('task/.celebi/config.json', 'change')).toBe(true);
    expect(affectsTree('task/.celebi/config.local.json', 'structure')).toBe(true);
});
