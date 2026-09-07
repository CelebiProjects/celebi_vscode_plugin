/** Execute the actual Python adapter against a small API double and real directories. */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PYTHON_SCRIPT, PYTHON_DAEMON_SCRIPT } from '../celebiScript';

const apiDouble = `
import sys, types, os
class Config:
    def read_variable(self, key, default=None):
        return {"impression": "latest"}.get(key, default)
class Object:
    def __init__(self, path, project):
        self.path, self.project, self.config_file = path, project, Config()
    def sub_objects(self):
        if self.path != self.project:
            raise AssertionError("Must not recursively list child objects")
        return [Object(os.path.join(self.path, "task"), self.project)]
    def sub_objects_recursively(self):
        raise AssertionError("Recursive API must not be used")
    def object_type(self):
        return "task" if os.path.basename(self.path) == "task" else "project"
    def readme(self):
        return "API README"
class Task(Object):
    def get_descriptor(self): return "API descriptor"
    def environment(self): return "python"
    def commands(self): return ["task-level API command"]
    def parameters(self): return (["n"], {"n": 3})
    def memory_limit(self): return "1Gi"
    def default_runner(self): return "local"
    def get_alias_list(self): return {"input": "some/path"}.keys()
class Yaml:
    def __init__(self, path): pass
    def read_variable(self, key, default): return default
for name, attrs in {
    "CelebiChrono": {}, "CelebiChrono.kernel": {}, "CelebiChrono.utils": {},
    "CelebiChrono.kernel.vobject": {"VObject": Object},
    "CelebiChrono.kernel.vtask": {"VTask": Task},
    "CelebiChrono.utils.metadata": {"YamlFile": Yaml},
}.items():
    module = types.ModuleType(name)
    module.__dict__.update(attrs)
    sys.modules[name] = module
`;
let root: string;
beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'celebi-api-'));
    fs.mkdirSync(path.join(root, 'task', 'nested'), { recursive: true });
    fs.mkdirSync(path.join(root, 'impression_data', 'many-results'), { recursive: true });
    fs.mkdirSync(path.join(root, 'plain', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'hello.txt'), 'hello');
    fs.writeFileSync(path.join(root, '.hidden'), 'hidden');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const execute = (mode: string, node = root) => JSON.parse(execFileSync('python3',
    ['-B', '-c', apiDouble + '\n' + PYTHON_SCRIPT, root, mode, node], { encoding: 'utf8' }));

test('children contains just one layer, preserves plain directories and avoids impression data', () => {
    const result = execute('children');
    expect(result.entries.map((entry: { path: string }) => entry.path).sort()).toEqual(['hello.txt', 'plain', 'task']);
    expect(result.entries.find((entry: { path: string }) => entry.path === 'task')).toMatchObject({ kind: 'object', type: 'task' });
    expect(result.entries.find((entry: { path: string }) => entry.path === 'hello.txt')).toMatchObject({ kind: 'file', size: { raw: 5 } });
});

test('detail delegates task commands, parameters, aliases and configuration to the API', () => {
    const result = execute('detail', path.join(root, 'task'));
    expect(result).toMatchObject({
        data: { childrenCount: 1, commands: ['task-level API command'], parameters: { n: 3 }, aliases: ['input'], default_runner: 'local' },
        config: { impression: 'latest' }, readme: 'API README',
    });
});

test('daemon reuses objects returned by the API when expanding a child repeatedly', () => {
    const reuseDouble = apiDouble + `
created = {}
class ReusedObject(Object):
    def __init__(self, path, project=None):
        assert path not in created, "Object was constructed again: " + path
        created[path] = True
        super().__init__(path, project or path)
    def sub_objects(self):
        if self.path == self.project:
            return [ReusedObject(os.path.join(self.path, "plain"), self.project)]
        return []
sys.modules["CelebiChrono.kernel.vobject"].VObject = ReusedObject
module = types.ModuleType("CelebiChrono.kernel.vproject")
module.VProject = ReusedObject
sys.modules[module.__name__] = module
`;
    const requests = [root, path.join(root, 'plain'), path.join(root, 'plain')]
        .map((node, id) => JSON.stringify({ id, mode: 'children', node })).join('\n') + '\n';
    const results = execFileSync('python3', ['-B', '-c', reuseDouble + PYTHON_DAEMON_SCRIPT, root], {
        input: requests, encoding: 'utf8',
    }).trim().split('\n').map(line => JSON.parse(line));
    expect(results).toHaveLength(3);
    for (const result of results) {
        expect(result.error).toBeUndefined();
        expect(result.python_ms).toEqual(expect.any(Number));
        expect(result.result.entries).toEqual(expect.any(Array));
    }
});
