import { exec } from 'child_process';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Celebi');
    }
    return outputChannel;
}

function findVirtualenv(projectPath: string | undefined): string | undefined {
    const config = vscode.workspace.getConfiguration('celebi');
    const configuredVenv = config.get<string>('virtualenvPath', '');
    if (configuredVenv) {
        return configuredVenv;
    }

    if (!projectPath) {
        return undefined;
    }

    // Common virtualenv directory names
    const venvNames = ['.venv', 'venv', 'env', '.env', 'virtualenv'];

    for (const name of venvNames) {
        const venvPath = path.join(projectPath, name);
        if (fs.existsSync(venvPath)) {
            return venvPath;
        }
    }

    return undefined;
}

function getPythonPath(venvPath: string | undefined): string {
    const config = vscode.workspace.getConfiguration('celebi');
    const configuredPython = config.get<string>('pythonPath', '');

    if (configuredPython) {
        return configuredPython;
    }

    if (venvPath) {
        // Determine the Python executable path based on platform
        const isWindows = process.platform === 'win32';
        const pythonExe = isWindows ? 'python.exe' : 'python';

        // Try Scripts/bin directory (standard venv structure)
        const scriptsDir = isWindows ? 'Scripts' : 'bin';
        const venvPython = path.join(venvPath, scriptsDir, pythonExe);

        if (fs.existsSync(venvPython)) {
            return venvPython;
        }
    }

    return 'python';
}

function buildPythonCode(pythonExpr: string, packagePath: string): string {
    // Build code as a single line using semicolons to avoid indentation issues
    const lines: string[] = [];
    if (packagePath) {
        lines.push(`import sys`);
        lines.push(`sys.path.insert(0, '${packagePath}')`);
    }
    lines.push(`from CelebiChrono.interface import ChernManager, shell`);
    lines.push(`result = ${pythonExpr}`);
    lines.push(`print(result) if result is not None else None`);
    return lines.join('; ');
}

export function execPython(pythonExpr: string): Promise<string> {
    const config = vscode.workspace.getConfiguration('celebi');
    const packagePath = config.get<string>('packagePath', '');
    const projectPath = getProjectPath();
    const venvPath = findVirtualenv(projectPath);
    const pythonPath = getPythonPath(venvPath);

    const code = buildPythonCode(pythonExpr, packagePath);

    return new Promise((resolve, reject) => {
        const escapedCode = code.replace(/"/g, '\\"');
        const command = `"${pythonPath}" -c "${escapedCode}"`;

        const env = { ...process.env };
        if (venvPath) {
            // Set VIRTUAL_ENV to help Python recognize the virtualenv
            env.VIRTUAL_ENV = venvPath;
            // Prepend venv's bin/Scripts to PATH
            const isWindows = process.platform === 'win32';
            const scriptsDir = isWindows ? 'Scripts' : 'bin';
            const venvBin = path.join(venvPath, scriptsDir);
            env.PATH = `${venvBin}${path.delimiter}${env.PATH}`;
        }

        exec(command, { cwd: projectPath, env }, (error, stdout, stderr) => {
            const output = getOutputChannel();
            output.appendLine(`> ${pythonExpr}`);
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

export function execPythonInTerminal(pythonExpr: string) {
    const config = vscode.workspace.getConfiguration('celebi');
    const packagePath = config.get<string>('packagePath', '');
    const projectPath = getProjectPath();
    const venvPath = findVirtualenv(projectPath);
    const pythonPath = getPythonPath(venvPath);

    const code = buildPythonCode(pythonExpr, packagePath);

    // Check if there's already a Celebi terminal
    let terminal = vscode.window.terminals.find(t => t.name === 'Celebi Python');
    if (!terminal) {
        terminal = vscode.window.createTerminal('Celebi Python');
    }
    terminal.show();

    // If using a virtualenv, activate it first
    if (venvPath) {
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

    const escapedCode = code.replace(/"/g, '\\"');
    terminal.sendText(`${pythonPath} -c "${escapedCode}"`);
}

function getProjectPath(): string | undefined {
    const config = vscode.workspace.getConfiguration('celebi');
    const configuredPath = config.get<string>('projectPath', '');
    if (configuredPath) {
        return configuredPath;
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
