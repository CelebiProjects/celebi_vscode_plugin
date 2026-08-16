/**
 * One-shot Python executor for Celebi project data, ported from
 * celebi_ui electron/ipc/filesystem.js (PYTHON_SCRIPT + runCelebiPython).
 *
 * mode=project: VProject.sub_objects_recursively() + os.walk workspace files
 * mode=readme:  VObject(node_path).readme()
 */
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ObjectRecord, FileRecord } from './tree/treeBuilder';

const PYTHON_SCRIPT = `
import json
import os
import re
import sys

project_path = sys.argv[1]
mode = sys.argv[2]
node_path = sys.argv[3] if len(sys.argv) > 3 else ""

def human_readable_size(num):
    if num == 0:
        return "0 B"
    k = 1024
    sizes = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    size = float(num)
    while size >= k and i < len(sizes) - 1:
        size /= k
        i += 1
    return f"{size:.1f}".rstrip("0").rstrip(".") + " " + sizes[i]

if mode == "project":
    from CelebiChrono.kernel.vproject import VProject

    project = VProject(project_path)
    objects = []
    for obj in project.sub_objects_recursively():
        obj_type = obj.object_type()
        if obj_type in ("", "project"):
            continue

        record = {
            "path": obj.invariant_path(),
            "type": obj_type,
        }

        try:
            descriptor = obj.get_descriptor()
        except Exception:
            descriptor = ""
        if descriptor:
            record["descriptor"] = descriptor

        try:
            if obj_type == "task":
                environment = obj.environment()
                if environment:
                    record["environment"] = environment
                memory_limit = obj.memory_limit()
                if memory_limit:
                    record["memory_limit"] = memory_limit
            elif obj_type == "algorithm":
                environment = obj.environment()
                if environment:
                    record["environment"] = environment
        except Exception:
            pass

        # Read celebi.yaml for additional metadata
        import yaml as _yaml
        try:
            yaml_path = os.path.join(obj.path, "celebi.yaml")
            if os.path.exists(yaml_path):
                with open(yaml_path, encoding="utf-8") as _f:
                    _meta = _yaml.safe_load(_f) or {}
                record["parameters"] = _meta.get("parameters", {})
                record["validated"] = bool(_meta.get("validated", False))
                record["default_runner"] = _meta.get("default_runner", "")
                record["use_eos"] = bool(_meta.get("use_eos", False))
                record["aliases"] = _meta.get("alias", []) or _meta.get("aliases", [])
                record["code_files"] = _meta.get("code_files", [])
                record["commands"] = _meta.get("commands", [])
                # Use VAlgorithm.commands() for algorithms
                if obj_type == "algorithm":
                    from CelebiChrono.kernel.valgorithm import VAlgorithm
                    record["commands"] = VAlgorithm(obj.path).commands()
        except Exception:
            pass

        # For tasks, get commands from linked algorithm
        if obj_type == "task":
            _params = record.get("parameters", {})
            config_path = os.path.join(obj.path, ".celebi", "config.json")
            if os.path.exists(config_path):
                with open(config_path, encoding="utf-8") as _f:
                    _cfg = json.load(_f)
                for pred in _cfg.get("predecessors", []):
                    algo_path = os.path.join(project_path, pred)
                    algo_yaml = os.path.join(algo_path, "celebi.yaml")
                    if os.path.exists(algo_yaml):
                        from CelebiChrono.kernel.valgorithm import VAlgorithm
                        _cmds = VAlgorithm(algo_path).commands()
                        if _cmds:
                            record["commands"] = _cmds
                        break
            # Substitute parameters
            if _params and record.get("commands"):
                record["commands"] = [
                    re.sub(r'\\$\\{(\\w+)\\}', lambda m: str(_params.get(m.group(1), m.group(0))), str(c))
                    for c in record["commands"]
                ]

        objects.append(record)

    files = []
    for dirpath, dirnames, filenames in os.walk(project_path):
        dirnames[:] = [
            d for d in dirnames
            if not d.startswith(".") and not d.startswith("dot_")
        ]
        rel_dir = os.path.relpath(dirpath, project_path)

        for filename in filenames:
            if filename.startswith("."):
                continue
            if filename.endswith("~undo-tree~"):
                continue

            full_path = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(full_path, project_path)
            if rel_path.startswith("impression_data/"):
                continue
            try:
                stat = os.stat(full_path)
            except OSError:
                continue
            files.append({
                "name": rel_path,
                "size": {
                    "raw": stat.st_size,
                    "human_readable": human_readable_size(stat.st_size),
                },
                "lastModified": __import__("datetime").datetime.fromtimestamp(
                    stat.st_mtime
                ).isoformat(),
                "absolutePath": full_path,
            })

    print(json.dumps({"objects": objects, "files": files}))
    raise SystemExit(0)

if mode == "readme":
    from CelebiChrono.kernel.vobject import VObject
    try:
        print(json.dumps({"readme": VObject(node_path).readme()}))
    except Exception:
        print(json.dumps({"readme": None}))
    raise SystemExit(0)

raise SystemExit(1)
`;

export interface ProjectData {
    objects: ObjectRecord[];
    files: FileRecord[];
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
 * Run the embedded Celebi Python script once and return parsed JSON.
 * Throws on non-zero exit or invalid JSON output.
 */
export async function runCelebiPython(
    mode: 'project' | 'readme',
    projectPath: string,
    nodePath = ''
): Promise<ProjectData | { readme: string | null }> {
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

    const pyEnv: NodeJS.ProcessEnv = { ...process.env };
    if (env.packagePath) {
        pyEnv.PYTHONPATH = [env.packagePath, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
    }

    return new Promise((resolve, reject) => {
        execFile(
            env.pythonPath,
            ['-c', PYTHON_SCRIPT, projectPath, mode, nodePath],
            { env: pyEnv, maxBuffer: 100 * 1024 * 1024 },
            (error, stdout) => {
                if (error) {
                    reject(new Error(`Celebi Python script failed (${env.pythonPath}): ${error.message}`));
                    return;
                }
                try {
                    resolve(JSON.parse(stdout.trim() || '{}'));
                } catch {
                    reject(new Error('Celebi Python script returned invalid JSON'));
                }
            }
        );
    });
}
