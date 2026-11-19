import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);

export interface CelebiProject {
    name: string;
    path: string;
    current: boolean;
}

/** Parse the human-readable registry emitted by `celebi-cli list-projects`. */
export function parseCelebiProjects(output: string): CelebiProject[] {
    const projects: CelebiProject[] = [];
    for (const line of output.split(/\r?\n/)) {
        const match = line.match(/^\s*(\*)?\s*([^:]+?):\s+(.+?)\s*$/);
        if (!match) continue;
        projects.push({ name: match[2].trim(), path: match[3], current: match[1] === '*' });
    }
    return projects;
}

async function listCelebiProjects(): Promise<CelebiProject[]> {
    const { stdout } = await execFileAsync('celebi-cli', ['list-projects'], {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
    });
    return parseCelebiProjects(stdout);
}

function samePath(left: string, right: string): boolean {
    const normalize = (value: string) => path.resolve(value).replace(/[\\/]$/, '');
    return normalize(left) === normalize(right);
}

/** Add the Celebi registry project picker to the status bar's left section. */
export function registerProjectSelector(context: vscode.ExtensionContext): vscode.WorkspaceFolder | undefined {
    const projectFolder = vscode.workspace.workspaceFolders?.[0];
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    status.name = 'Celebi Project';
    status.command = 'celebi.selectProject';
    status.text = projectFolder ? `$(folder) ${projectFolder.name}` : '$(folder) Select Project';
    status.tooltip = projectFolder
        ? `Celebi project: ${projectFolder.uri.fsPath}\n\nClick to select another registered project.`
        : 'Select a registered Celebi project';
    status.show();

    const updateProjectName = async (): Promise<void> => {
        if (!projectFolder) return;
        try {
            const projects = await listCelebiProjects();
            const active = projects.find(project => samePath(project.path, projectFolder.uri.fsPath));
            if (active) status.text = `$(folder) ${active.name}`;
        } catch {
            // Keep the workspace folder name; clicking the selector reports the CLI error.
        }
    };

    context.subscriptions.push(
        status,
        vscode.commands.registerCommand('celebi.selectProject', async () => {
            let projects: CelebiProject[];
            try {
                projects = await listCelebiProjects();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                void vscode.window.showErrorMessage(
                    `Celebi: could not list projects with "celebi-cli list-projects": ${message}`
                );
                return;
            }
            if (!projects.length) {
                void vscode.window.showInformationMessage('Celebi: no registered projects found.');
                return;
            }

            const picked = await vscode.window.showQuickPick(projects.map(project => ({
                label: `$(folder) ${project.name}`,
                description: projectFolder && samePath(project.path, projectFolder.uri.fsPath)
                    ? 'Current workspace'
                    : project.current ? 'Current Celebi project' : undefined,
                detail: project.path,
                project,
            })), {
                placeHolder: 'Select a registered Celebi project',
                matchOnDescription: true,
                matchOnDetail: true,
            });
            if (!picked || (projectFolder && samePath(picked.project.path, projectFolder.uri.fsPath))) return;
            await vscode.commands.executeCommand(
                'vscode.openFolder', vscode.Uri.file(picked.project.path), { forceNewWindow: false }
            );
        }),
    );

    void updateProjectName();
    return projectFolder;
}
