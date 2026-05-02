/**
 * Python integration layer.
 *
 * Executes Python expressions through the CelebiChrono shell interface.
 * Handles virtualenv detection, Python path resolution, server profiles
 * (with optional SSH remote execution), and code generation for both
 * single-line (-c) and multi-line (temp file) execution modes.
 *
 * Exports:
 *  - execPython(expr): run a Python expression, return stdout
 *  - execPythonInTerminal(expr): run in the VS Code integrated terminal
 *  - getOutputChannel(): lazily-initialized Celebi output channel
 *  - resolveServerProfile(): read active server config
 */
import { exec } from 'child_process';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---- Types ----

/** A named server profile from celebi.servers settings. */
export interface ServerProfile {
    host?: string;
    pythonPath?: string;
    virtualenvPath?: string;
    packagePath?: string;
}

// ---- Output channel ----

let outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Celebi');
    }
    return outputChannel;
}

// ---- Server profile resolution ----

/**
 * Read the active server profile from settings.
 *
 * When `celebi.activeServer` is set, looks up the named profile in
 * `celebi.servers` and returns it.  If no server is active, or the
 * profile doesn't exist, returns undefined.
 */
export function resolveServerProfile(): { name: string; profile: ServerProfile } | undefined {
    const config = vscode.workspace.getConfiguration('celebi');
    const activeName = config.get<string>('activeServer', '');
    if (!activeName) return undefined;

    const servers = config.get<Record<string, ServerProfile>>('servers', {});
    const profile = servers[activeName];
    if (!profile) return undefined;

    return { name: activeName, profile };
}

// ---- Virtualenv detection ----

/**
 * Find the Python virtualenv path.
 * Checks the configured path first (respecting server profile),
 * then scans common directory names.
 */
function findVirtualenv(projectPath: string | undefined, profile?: ServerProfile): string | undefined {
    // Server profile takes priority
    if (profile?.virtualenvPath) {
        return profile.virtualenvPath;
    }

    const config = vscode.workspace.getConfiguration('celebi');
    const configuredVenv = config.get<string>('virtualenvPath', '');
    if (configuredVenv) {
        return configuredVenv;
    }

    if (!projectPath) {
        return undefined;
    }

    const venvNames = ['.venv', 'venv', 'env', '.env', 'virtualenv'];

    for (const name of venvNames) {
        const venvPath = path.join(projectPath, name);
        if (fs.existsSync(venvPath)) {
            return venvPath;
        }
    }

    return undefined;
}

// ---- Python path resolution ----

/**
 * Determine the Python executable path.
 * Uses the server profile, then the configured pythonPath, then
 * resolves from the virtualenv's bin/Scripts directory, or falls
 * back to 'python' on PATH.
 */
function getPythonPath(venvPath: string | undefined, profile?: ServerProfile): string {
    // Server profile takes priority
    if (profile?.pythonPath) {
        return profile.pythonPath;
    }

    const config = vscode.workspace.getConfiguration('celebi');
    const configuredPython = config.get<string>('pythonPath', '');

    if (configuredPython) {
        return configuredPython;
    }

    if (venvPath) {
        const isWindows = process.platform === 'win32';
        const pythonExe = isWindows ? 'python.exe' : 'python';
        const scriptsDir = isWindows ? 'Scripts' : 'bin';
        const venvPython = path.join(venvPath, scriptsDir, pythonExe);

        if (fs.existsSync(venvPython)) {
            return venvPython;
        }
    }

    return 'python';
}

// ---- Code generation ----

/**
 * Build a Python script from a CelebiChrono shell expression.
 *
 * For single-line expressions, uses semicolons for compact -c execution.
 * For multi-line code, returns a proper script (saved to temp file).
 */
function buildPythonCode(pythonExpr: string, packagePath: string): string {
    if (pythonExpr.includes('\n')) {
        const lines: string[] = [];
        if (packagePath) {
            lines.push(`import sys`);
            lines.push(`sys.path.insert(0, '${packagePath}')`);
        }
        lines.push(`from CelebiChrono.interface import ChernManager, shell`);
        lines.push(`from CelebiChrono.kernel.vobj_file_display import LsParameters`);
        lines.push(pythonExpr.trim());
        lines.push(`print(result) if result is not None else None`);
        return lines.join('\n');
    }

    const lines: string[] = [];
    if (packagePath) {
        lines.push(`import sys`);
        lines.push(`sys.path.insert(0, '${packagePath}')`);
    }
    lines.push(`from CelebiChrono.interface import ChernManager, shell`);
    lines.push(`from CelebiChrono.kernel.vobj_file_display import LsParameters`);
    lines.push(`result = ${pythonExpr}`);
    lines.push(`print(result) if result is not None else None`);
    return lines.join('; ');
}

// ---- SSH remote execution helper ----

/**
 * Wrap a Python command for remote execution via SSH.
 * Changes the profile's projectPath into cd before the python call.
 */
function wrapRemoteCommand(command: string, host: string, projectPath: string | undefined): string {
    const remotePath = projectPath || '.';
    return `ssh ${host} "cd ${remotePath} && ${command}"`;
}

// ---- Public API ----

/**
 * Execute a Python expression via CelebiChrono and return the stdout result.
 *
 * When an active server profile has a host, the command is wrapped in SSH.
 * Handles virtualenv activation, temp file management for multi-line code,
 * and writes execution output to the Celebi output channel.
 */
export function execPython(pythonExpr: string): Promise<string> {
    const config = vscode.workspace.getConfiguration('celebi');
    const server = resolveServerProfile();
    const profile = server?.profile;

    const packagePath = profile?.packagePath ?? config.get<string>('packagePath', '');
    const projectPath = getProjectPath();
    const venvPath = findVirtualenv(projectPath, profile);
    const pythonPath = getPythonPath(venvPath, profile);

    const code = buildPythonCode(pythonExpr, packagePath);

    return new Promise((resolve, reject) => {
        let command: string;
        let tmpFile: string | undefined;

        if (pythonExpr.includes('\n')) {
            tmpFile = path.join(os.tmpdir(), `celebi_${Date.now()}.py`);
            fs.writeFileSync(tmpFile, code);
            command = `"${pythonPath}" "${tmpFile}"`;
        } else {
            const escapedCode = code.replace(/"/g, '\\"');
            command = `"${pythonPath}" -c "${escapedCode}"`;
        }

        // Wrap in SSH if the profile has a host
        if (profile?.host) {
            command = wrapRemoteCommand(command, profile.host, projectPath);
        }

        const env = { ...process.env };
        if (venvPath && !profile?.host) {
            // venv PATH injection only applies locally; remote uses its own venv
            env.VIRTUAL_ENV = venvPath;
            const isWindows = process.platform === 'win32';
            const scriptsDir = isWindows ? 'Scripts' : 'bin';
            const venvBin = path.join(venvPath, scriptsDir);
            env.PATH = `${venvBin}${path.delimiter}${env.PATH}`;
        }

        exec(command, { cwd: projectPath, env }, (error, stdout, stderr) => {
            // Clean up temp file
            if (tmpFile && fs.existsSync(tmpFile)) {
                try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
            }

            const output = getOutputChannel();
            output.appendLine(`> ${pythonExpr}`);
            if (server) {
                output.appendLine(`(server: ${server.name}${profile?.host ? ' via ssh ' + profile.host : ''})`);
            }
            if (venvPath) {
                output.appendLine(`(using venv: ${venvPath})`);
            }

            if (stderr) {
                output.appendLine(`stderr: ${stderr}`);
            }

            if (error) {
                output.appendLine(`error: ${error.message}`);
                output.show();
                reject(new Error(`Celebi command failed: ${error.message}`));
                return;
            }

            const result = stdout.trim();
            output.appendLine(`result: ${result}`);
            output.show();
            resolve(result);
        });
    });
}

/**
 * Execute a Python expression in the VS Code integrated terminal.
 * Uses a dedicated "Celebi Python" terminal (shared across calls).
 * When the active server has a host, the SSH command is sent to the terminal.
 */
export function execPythonInTerminal(pythonExpr: string) {
    const config = vscode.workspace.getConfiguration('celebi');
    const server = resolveServerProfile();
    const profile = server?.profile;

    const packagePath = profile?.packagePath ?? config.get<string>('packagePath', '');
    const projectPath = getProjectPath();
    const venvPath = findVirtualenv(projectPath, profile);
    const pythonPath = getPythonPath(venvPath, profile);

    const code = buildPythonCode(pythonExpr, packagePath);

    // Build the local command
    const escapedCode = code.replace(/"/g, '\\"');
    let command = `${pythonPath} -c "${escapedCode}"`;

    // Wrap in SSH if needed
    if (profile?.host) {
        const remotePath = projectPath || '.';
        command = `ssh ${profile.host} "cd ${remotePath} && ${command}"`;
    }

    let terminal = vscode.window.terminals.find(t => t.name === 'Celebi Python');
    if (!terminal) {
        terminal = vscode.window.createTerminal('Celebi Python');
    }
    terminal.show();

    // Activate virtualenv if present (local only)
    if (venvPath && !profile?.host) {
        const isWindows = process.platform === 'win32';
        const activateScript = isWindows
            ? path.join(venvPath, 'Scripts', 'activate.bat')
            : path.join(venvPath, 'bin', 'activate');

        if (fs.existsSync(activateScript)) {
            if (isWindows) {
                terminal.sendText(`"${activateScript}"`);
            } else {
                terminal.sendText(`source "${activateScript}"`);
            }
        }
    }

    terminal.sendText(command);
}

// ---- Helpers ----

/** Resolve the project root path from config or workspace folders. */
function getProjectPath(): string | undefined {
    const config = vscode.workspace.getConfiguration('celebi');
    const configuredPath = config.get<string>('projectPath', '');
    if (configuredPath) {
        return configuredPath;
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
