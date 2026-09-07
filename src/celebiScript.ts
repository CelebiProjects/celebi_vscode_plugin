/**
 * On-demand Python adapter for Celebi children and selected-object details.
 */
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { createInterface } from 'readline';
import { timing, elapsed } from './timing';

let requestSequence = 0;
const workers = new Map<string, PythonWorker>();
import * as fs from 'fs';
import * as path from 'path';

/** A thin, one-directory adapter over Celebi's public object API. */
export const PYTHON_SCRIPT = `
import json
import os
import sys
import time
from datetime import datetime, timezone

_started = _last = time.perf_counter()
_trace = sys.argv[4] if len(sys.argv) > 4 else "terminal"
def mark(event, **fields):
    global _last
    now = time.perf_counter()
    print("[Celebi timing] " + json.dumps({
        "at": datetime.now(timezone.utc).isoformat(), "event": event,
        "request": _trace, "mode": sys.argv[2], "node": sys.argv[3] or ".",
        "step_ms": round((now - _last) * 1000, 1),
        "python_ms": round((now - _started) * 1000, 1), **fields,
    }), file=sys.stderr, flush=True)
    _last = now

mark("python.script.start")
from CelebiChrono.kernel.vobject import VObject
mark("python.import.done")

project_path = os.path.abspath(sys.argv[1])
mode = sys.argv[2]
node_path = os.path.abspath(sys.argv[3] or project_path)
if os.path.commonpath([project_path, node_path]) != project_path:
    raise ValueError("Node is outside the project")
obj = VObject(node_path, project_path)
mark("python.object.ready")

def human_readable_size(num):
    size = float(num)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            return f"{size:.1f}".rstrip("0").rstrip(".") + " " + unit
        size /= 1024

def visible_entry(entry):
    if entry.name.startswith((".", "dot_")) or entry.name.endswith("~undo-tree~"):
        return False
    if node_path == project_path and entry.name == "impression_data":
        return False
    return not (entry.is_symlink() and entry.is_dir())

if mode == "children":
    mark("python.sub_objects.start")
    objects = {os.path.abspath(child.path): child for child in obj.sub_objects()}
    mark("python.sub_objects.done", objects=len(objects))
    entries = []
    with os.scandir(node_path) as scan:
        for entry in scan:
            if not visible_entry(entry):
                continue
            child = objects.get(entry.path)
            kind = child.object_type() if child else ""
            is_dir = entry.is_dir(follow_symlinks=False)
            try:
                stat = entry.stat()
            except OSError:
                continue
            entries.append({
                "path": os.path.relpath(entry.path, project_path).replace(os.sep, "/"),
                "name": entry.name,
                "kind": "object" if kind else "directory" if is_dir else "file",
                "type": kind or None,
                "absolutePath": entry.path,
                "size": {"raw": stat.st_size, "human_readable": human_readable_size(stat.st_size)},
                "lastModified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })
    mark("python.files.done", entries=len(entries))
    print(json.dumps({"entries": entries}))
    mark("python.serialize.done")
elif mode == "detail":
    from CelebiChrono.utils.metadata import YamlFile
    kind = obj.object_type()
    if kind == "task":
        from CelebiChrono.kernel.vtask import VTask
        obj = VTask(node_path, project_path)
    elif kind == "algorithm":
        from CelebiChrono.kernel.valgorithm import VAlgorithm
        obj = VAlgorithm(node_path, project_path)
    mark("python.detail.object.ready")
    with os.scandir(node_path) as scan:
        data = {"childrenCount": sum(1 for entry in scan if visible_entry(entry))}
    mark("python.detail.count.done")
    if kind in ("task", "algorithm"):
        data["descriptor"] = obj.get_descriptor()
        data["environment"] = obj.environment()
        mark("python.commands.start")
        data["commands"] = obj.commands()
        mark("python.commands.done")
        meta = YamlFile(os.path.join(node_path, "celebi.yaml"))
        data["code_files"] = meta.read_variable("code_files", [])
    if kind == "task":
        data["parameters"] = obj.parameters()[1]
        data["memory_limit"] = obj.memory_limit()
        data["default_runner"] = obj.default_runner()
        data["aliases"] = list(obj.get_alias_list())
    mark("python.detail.metadata.done")
    config = {key: obj.config_file.read_variable(key, default) for key, default in (
        ("predecessors", []), ("successors", []), ("impressions", []), ("impression", "")
    )}
    try:
        readme = obj.readme()
    except OSError:
        readme = None
    mark("python.detail.config_readme.done")
    type_map = {}
    for relative in config["predecessors"] + config["successors"]:
        linked_path = os.path.abspath(os.path.join(project_path, relative))
        if os.path.commonpath([project_path, linked_path]) == project_path:
            type_map[relative] = VObject(linked_path, project_path).object_type()
    mark("python.detail.links.done")
    print(json.dumps({"data": data, "config": config, "readme": readme, "typeMap": type_map}))
    mark("python.serialize.done")
elif mode == "readme":
    try:
        readme = obj.readme()
    except OSError:
        readme = None
    print(json.dumps({"readme": readme}))
else:
    raise ValueError("Unknown mode: " + mode)
`;

/** Long-lived Celebi API worker. Imports and object instances survive requests. */
export const PYTHON_DAEMON_SCRIPT = `
import json, os, sys, time
from CelebiChrono.kernel.vobject import VObject
from CelebiChrono.kernel.vproject import VProject

project_path = os.path.abspath(sys.argv[1])
project = VProject(project_path)
objects = {project_path: project}
def get_object(node_path):
    if node_path not in objects:
        objects[node_path] = VObject(node_path, project_path)
    return objects[node_path]
def visible(e, root):
    return not e.name.startswith((".", "dot_")) and not e.name.endswith("~undo-tree~") and not (root == project_path and e.name == "impression_data") and not (e.is_symlink() and e.is_dir())
def children(node_path):
    obj = get_object(node_path)
    object_map = {os.path.abspath(x.path): x for x in obj.sub_objects()}
    for child_path, child in object_map.items():
        objects.setdefault(child_path, child)
    out = []
    with os.scandir(node_path) as scan:
        for e in scan:
            if not visible(e, node_path): continue
            child = object_map.get(os.path.abspath(e.path)); kind = child.object_type() if child else ""
            is_dir = e.is_dir(follow_symlinks=False)
            try: st = e.stat()
            except OSError: continue
            out.append({"path": os.path.relpath(e.path, project_path).replace(os.sep, "/"), "name": e.name, "kind": "object" if kind else "directory" if is_dir else "file", "type": kind or None, "absolutePath": e.path, "size": {"raw": st.st_size}, "lastModified": str(st.st_mtime)})
    return {"entries": out}
def detail(node_path):
    from CelebiChrono.utils.metadata import YamlFile
    obj = get_object(node_path); kind = obj.object_type()
    if kind == "task":
        from CelebiChrono.kernel.vtask import VTask
        if not isinstance(obj, VTask):
            obj = objects[node_path] = VTask(node_path, project_path)
    elif kind == "algorithm":
        from CelebiChrono.kernel.valgorithm import VAlgorithm
        if not isinstance(obj, VAlgorithm):
            obj = objects[node_path] = VAlgorithm(node_path, project_path)
    data = {"childrenCount": sum(1 for e in os.scandir(node_path) if visible(e, node_path))}
    if kind in ("task", "algorithm"):
        data.update({"descriptor": obj.get_descriptor(), "environment": obj.environment(), "commands": obj.commands()})
        data["code_files"] = YamlFile(os.path.join(node_path, "celebi.yaml")).read_variable("code_files", [])
    if kind == "task":
        data.update({"parameters": obj.parameters()[1], "memory_limit": obj.memory_limit(), "default_runner": obj.default_runner(), "aliases": list(obj.get_alias_list())})
    config = {k: obj.config_file.read_variable(k, d) for k, d in (("predecessors", []), ("successors", []), ("impressions", []), ("impression", ""))}
    try: readme = obj.readme()
    except OSError: readme = None
    return {"data": data, "config": config, "readme": readme, "typeMap": {}}
for line in sys.stdin:
    req = {}
    started = time.perf_counter()
    try:
        req = json.loads(line); node = os.path.abspath(req.get("node") or project_path)
        result = children(node) if req["mode"] == "children" else detail(node) if req["mode"] == "detail" else {"readme": get_object(node).readme()}
        print(json.dumps({"id": req["id"], "result": result, "python_ms": round((time.perf_counter() - started) * 1000, 1)}), flush=True)
    except Exception as exc:
        print(json.dumps({"id": req.get("id"), "error": str(exc)}), flush=True)
`;

class PythonWorker {
    private readonly child: ChildProcessWithoutNullStreams;
    private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
    constructor(private readonly python: string, private readonly project: string, env: NodeJS.ProcessEnv) {
        this.child = spawn(python, ['-u', '-c', PYTHON_DAEMON_SCRIPT, project], { cwd: project, env });
        createInterface({ input: this.child.stdout }).on('line', line => {
            try {
                const message = JSON.parse(line) as { id: number; result?: unknown; error?: string; python_ms?: number };
                const item = this.pending.get(message.id); if (!item) return;
                this.pending.delete(message.id);
                timing('python.worker.execution', { request: message.id, python_ms: message.python_ms });
                message.error ? item.reject(new Error(message.error)) : item.resolve(message.result);
            } catch { /* ignore malformed worker output */ }
        });
        // A full stderr pipe would block the persistent process on later requests.
        this.child.stderr.resume();
        this.child.on('error', error => this.fail(error));
        this.child.on('exit', code => this.fail(new Error(`Celebi worker exited (${code})`)));
    }
    request(mode: string, node: string, id: number): Promise<unknown> {
        return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.child.stdin.write(JSON.stringify({ id, mode, node }) + '\n'); });
    }
    private fail(error: Error): void { for (const item of this.pending.values()) item.reject(error); this.pending.clear(); }
    dispose(): void { this.child.kill(); this.fail(new Error('Celebi worker stopped')); }
}

export function disposeCelebiPythonWorkers(): void {
    for (const worker of workers.values()) worker.dispose();
    workers.clear();
}

export interface ChildEntry {
    path: string;
    name: string;
    kind: 'object' | 'directory' | 'file';
    type: import('./tree/treeBuilder').CelebiType | null;
    absolutePath: string;
    size?: { raw: number; human_readable: string };
    lastModified?: string;
}

export interface ChildrenData { entries: ChildEntry[] }
export interface ObjectDetailData {
    typeMap: Record<string, string>;
    data: Record<string, unknown>;
    config: Record<string, unknown>;
    readme: string | null;
}

export interface CelebiPythonConfig {
    pythonPath: string;
    virtualenvPath: string;
    packagePath: string;
}

/**
 * Resolve the Python interpreter and venv for a project.
 * Priority: configured pythonPath > configured virtualenvPath > auto-detected
 * venv (.venv/venv/env/.env/virtualenv) > 'python3'.
 */
export function resolvePythonEnv(
    projectPath: string,
    cfg: CelebiPythonConfig
): { pythonPath: string; venvPath?: string; packagePath: string } {
    let venvPath: string | undefined;
    if (cfg.virtualenvPath) {
        venvPath = cfg.virtualenvPath;
    } else {
        const venvNames = ['.venv', 'venv', 'env', '.env', 'virtualenv'];
        venvPath = venvNames
            .map((name) => path.join(projectPath, name))
            .find((candidate) => fs.existsSync(candidate));
    }

    let pythonPath = cfg.pythonPath;
    if (!pythonPath && venvPath) {
        const isWindows = process.platform === 'win32';
        const scriptsDir = isWindows ? 'Scripts' : 'bin';
        const pythonExe = isWindows ? 'python.exe' : 'python';
        const venvPython = path.join(venvPath, scriptsDir, pythonExe);
        if (fs.existsSync(venvPython)) {
            pythonPath = venvPython;
        }
    }
    if (!pythonPath) {
        pythonPath = 'python3';
    }

    return { pythonPath, venvPath, packagePath: cfg.packagePath };
}

/**
 * Send an API request to the persistent project worker.
 */
export async function runCelebiPython(
    mode: 'children' | 'detail' | 'readme',
    projectPath: string,
    nodePath = ''
): Promise<ChildrenData | ObjectDetailData | { readme: string | null }> {
    const started = performance.now();
    const request = ++requestSequence;
    // `vscode` exists only in the extension host, so require it lazily here
    // instead of at module top — the plain-jest environment cannot load it
    // (plan rule: unit tests must not import vscode). This function is only
    // ever called from the extension, where the real API is present.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscode: typeof import('vscode') = require('vscode');
    const config = vscode.workspace.getConfiguration('celebi');
    const cfg: CelebiPythonConfig = {
        pythonPath: config.get<string>('pythonPath', ''),
        virtualenvPath: config.get<string>('virtualenvPath', ''),
        packagePath: config.get<string>('packagePath', ''),
    };
    const env = resolvePythonEnv(projectPath, cfg);

    timing('python.config', {
        request,
        project: projectPath,
        configured_python: cfg.pythonPath || '(auto)',
        virtualenv: cfg.virtualenvPath || '(auto)',
        package_path: cfg.packagePath || '(none)',
        resolved_python: env.pythonPath,
    });

    const pyEnv: NodeJS.ProcessEnv = { ...process.env };
    if (env.packagePath) {
        pyEnv.PYTHONPATH = [env.packagePath, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
    }

    const workerKey = `${env.pythonPath}\0${projectPath}\0${env.packagePath}`;
    let worker = workers.get(workerKey);
    if (!worker) {
        timing('python.worker.start', { request, python: env.pythonPath, project: projectPath });
        worker = new PythonWorker(env.pythonPath, projectPath, pyEnv);
        workers.set(workerKey, worker);
    } else {
        timing('python.worker.reuse', { request, python: env.pythonPath, project: projectPath });
    }
    timing('python.request.start', { request, mode, node: nodePath || projectPath, python: env.pythonPath, setup_ms: elapsed(started) });
    return worker.request(mode, nodePath || projectPath, request).then(data => {
        timing('python.worker.response', { request, mode, total_ms: elapsed(started) });
        return data as ChildrenData | ObjectDetailData | { readme: string | null };
    });

}
