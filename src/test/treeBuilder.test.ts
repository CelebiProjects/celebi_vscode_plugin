import {
    buildObjectTree, mergeFilesIntoTree, buildTypeMap, findNodeByPath, findParent,
    TreeNode,
} from '../tree/treeBuilder';

const sampleObjects = [
    { path: 'tasks/analysis_1', type: 'task', environment: 'python3' },
    { path: 'algorithms/reco', type: 'algorithm' },
    { path: 'data/input', type: 'data' },
];

const sampleFiles = [
    { name: 'tasks/analysis_1/script.py', size: { raw: 1024, human_readable: '1 KB' }, lastModified: '2026-01-01T00:00:00Z' },
    { name: 'tasks/analysis_1/output.root', size: { raw: 2048, human_readable: '2 KB' }, lastModified: '2026-01-01T00:00:00Z' },
    { name: 'impression_data/tasks/analysis_1/plot.png', size: { raw: 10 }, lastModified: undefined },
    { name: '.hidden', size: { raw: 0, human_readable: '0 B' }, lastModified: undefined },
];

describe('buildObjectTree', () => {
    test('creates root node', () => {
        const tree = buildObjectTree(sampleObjects);
        expect(tree.id).toBe('__root__');
        expect(tree.type).toBe('directory');
    });

    test('creates directory hierarchy', () => {
        const tree = buildObjectTree(sampleObjects);
        const tasks = tree.children.find((c) => c.name === 'tasks');
        expect(tasks).toBeDefined();
        expect(tasks!.type).toBe('directory');
    });

    test('creates object nodes with correct types and icons', () => {
        const tree = buildObjectTree(sampleObjects);
        const tasks = tree.children.find((c) => c.name === 'tasks')!;
        const analysis = tasks.children.find((c) => c.name === 'analysis_1')!;
        expect(analysis.type).toBe('object');
        expect(analysis.celebiType).toBe('task');
        expect(analysis.icon).toBe('cog');
        expect(analysis.iconColor).toBe('orange');
    });

    test('sorts directories before other nodes', () => {
        // sampleObjects has no top-level objects; add one so the sort is observable.
        const tree = buildObjectTree([...sampleObjects, { path: 'standalone', type: 'data' }]);
        const types = tree.children.map((c) => c.type);
        expect(types.indexOf('directory')).toBeLessThan(types.indexOf('object'));
    });
});

describe('mergeFilesIntoTree', () => {
    test('merges files into matching object nodes via suffix matching', () => {
        const tree = buildObjectTree(sampleObjects);
        mergeFilesIntoTree(tree, sampleFiles);
        const tasks = tree.children.find((c) => c.name === 'tasks')!;
        const analysis = tasks.children.find((c) => c.name === 'analysis_1')!;
        const fileNames = analysis.children.filter((c) => c.type === 'file').map((c) => c.name);
        expect(fileNames).toContain('script.py');
        expect(fileNames).toContain('output.root');
    });

    test('skips hidden files and impression_data', () => {
        const tree = buildObjectTree([]);
        mergeFilesIntoTree(tree, sampleFiles);
        const hidden = tree.children.find((c) => c.name === '.hidden');
        expect(hidden).toBeUndefined();
        const impression = tree.children.find((c) => c.name === 'impression_data');
        expect(impression).toBeUndefined();
    });

    test('does not duplicate an existing file', () => {
        const tree = buildObjectTree([]);
        mergeFilesIntoTree(tree, [sampleFiles[0]]);
        mergeFilesIntoTree(tree, [sampleFiles[0]]);
        const all: string[] = [];
        const walk = (n: TreeNode) => { all.push(n.id); n.children.forEach(walk); };
        walk(tree);
        expect(all.filter((id) => id === 'tasks/analysis_1/script.py')).toHaveLength(1);
    });
});

describe('buildTypeMap / findNodeByPath / findParent', () => {
    const tree = buildObjectTree(sampleObjects);
    mergeFilesIntoTree(tree, sampleFiles);

    test('buildTypeMap maps ids to celebi types', () => {
        const map = buildTypeMap(tree);
        expect(map['tasks/analysis_1']).toBe('task');
        expect(map['algorithms/reco']).toBe('algorithm');
        expect(map['tasks']).toBeUndefined();
    });

    test('findNodeByPath returns node for object id', () => {
        expect(findNodeByPath(tree, 'tasks/analysis_1')?.name).toBe('analysis_1');
        expect(findNodeByPath(tree, 'nope')).toBeNull();
    });

    test('findParent returns the parent node', () => {
        const analysis = findNodeByPath(tree, 'tasks/analysis_1')!;
        expect(findParent(tree, 'tasks/analysis_1')?.id).toBe('tasks');
        expect(findParent(tree, 'tasks')?.id).toBe('__root__');
        expect(findParent(tree, '__root__')).toBeNull();
        expect(analysis).toBeDefined();
    });
});
