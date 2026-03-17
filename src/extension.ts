import * as vscode from 'vscode';
import * as path from 'path';
import { CelebiTreeProvider } from './treeProvider';
import { execPython, execPythonInTerminal, getOutputChannel } from './pythonRunner';
import { CelebiWebviewProvider } from './webviewProvider';

export function activate(context: vscode.ExtensionContext) {
    // Initialize output channel
    const outputChannel = getOutputChannel();
    context.subscriptions.push(outputChannel);

    const provider = new CelebiTreeProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('celebiTreeView', provider)
    );

    // Initialize webview provider
    const webviewProvider = new CelebiWebviewProvider();

    // Status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'celebi.showOutput';
    context.subscriptions.push(statusBarItem);

    // Update status bar with current project
    async function updateStatusBar() {
        try {
            const projectName = await execPython('shell.MANAGER.get_current_project()');
            statusBarItem.text = `$(project) Celebi: ${projectName}`;
            statusBarItem.tooltip = `Current Celebi project: ${projectName}`;
            statusBarItem.show();
        } catch {
            statusBarItem.text = `$(project) Celebi: No project`;
            statusBarItem.tooltip = 'No Celebi project active';
            statusBarItem.show();
        }
    }
    updateStatusBar();

    // File watcher for automatic tree refresh
    const config = vscode.workspace.getConfiguration('celebi');
    const projectPath = config.get<string>('projectPath', '') ||
                        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (projectPath) {
        // Watch for .celebi directory changes
        const celebiWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(projectPath, '.celebi/**/*')
        );
        celebiWatcher.onDidChange(() => provider.refresh());
        celebiWatcher.onDidCreate(() => provider.refresh());
        celebiWatcher.onDidDelete(() => provider.refresh());
        context.subscriptions.push(celebiWatcher);

        // Watch for impression files
        const impressWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(projectPath, '**/impressions/**/*')
        );
        impressWatcher.onDidChange(() => provider.refresh());
        impressWatcher.onDidCreate(() => provider.refresh());
        context.subscriptions.push(impressWatcher);
    }

    // Command with error handling
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.runPythonPackage', async (pythonExpr: string) => {
            try {
                await execPython(pythonExpr);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    // Command to run in terminal
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.runInTerminal', (pythonExpr: string) => {
            execPythonInTerminal(pythonExpr);
        })
    );

    // Command to show output channel
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showOutput', () => {
            outputChannel.show();
        })
    );

    // Command to refresh the tree view
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.refreshTree', () => {
            provider.refresh();
        })
    );

    // Command to refresh DITE status
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.refreshDite', async () => {
            try {
                await execPython('shell.MANAGER.current_object().printed_dite_status()');
                provider.refresh();
            } catch (error) {
                // Even if there's an error, refresh the tree to show the error state
                provider.refresh();
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi DITE: ${message}`);
            }
        })
    );

    // Command to open an object
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.openObject', async (objectPath: string) => {
            try {
                await execPython(`shell.MANAGER.sub_object('${objectPath}').status()`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    // Command to submit a task
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.submit', async () => {
            const objectName = await vscode.window.showInputBox({
                prompt: 'Enter object name to submit (or leave empty for current)',
                placeHolder: 'e.g., FitTask'
            });
            if (objectName === undefined) { return; } // Cancelled

            const pythonExpr = objectName
                ? `shell.MANAGER.sub_object('${objectName}').submit()`
                : 'shell.submit()';

            try {
                await execPython(pythonExpr);
                provider.refresh();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    // Command to impress an object
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.impress', async () => {
            const objectName = await vscode.window.showInputBox({
                prompt: 'Enter object name to impress',
                placeHolder: 'e.g., Fit'
            });
            if (!objectName) { return; }

            const impression = await vscode.window.showInputBox({
                prompt: 'Enter impression name',
                placeHolder: 'e.g., v1.0'
            });

            const pythonExpr = impression
                ? `shell.MANAGER.sub_object('${objectName}').impress('${impression}')`
                : `shell.MANAGER.sub_object('${objectName}').impress()`;

            try {
                await execPython(pythonExpr);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    // Command to switch project
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.switchProject', async () => {
            try {
                // Get list of projects
                const projectsResult = await execPython('shell.MANAGER.get_all_projects()');
                const projects = projectsResult
                    .replace(/[\[\]'"]/g, '')
                    .split(',')
                    .map(p => p.trim())
                    .filter(p => p);

                const selected = await vscode.window.showQuickPick(projects, {
                    placeHolder: 'Select a project to switch to'
                });

                if (selected) {
                    await execPython(`shell.MANAGER.switch_project('${selected}')`);
                    provider.refresh();
                    updateStatusBar();
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    // Command to execute arbitrary shell function
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.execute', async () => {
            const command = await vscode.window.showInputBox({
                prompt: 'Enter shell function to execute',
                placeHolder: 'e.g., shell.tree() or shell.ls()'
            });
            if (!command) { return; }

            try {
                await execPython(command);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    // Command to show trace visualization
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showTrace', async (objectName?: string) => {
            await webviewProvider.showTraceView(objectName);
        })
    );

    // SCM / Git integration commands
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.gitStatus', async () => {
            try {
                await execPython('shell.changes()');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.gitHistory', async () => {
            try {
                await execPython('shell.history()');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    // Command to view task results (browse output files)
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.viewResults', async (objectName: string) => {
            try {
                // First try to get view URL for browser using impview on the task object
                const urlResult = await execPython(
                    `shell.MANAGER.sub_object('${objectName}').impview()`
                );

                // Check if URL was returned (impview returns a URL string like http://localhost:...)
                if (urlResult && urlResult.startsWith('http')) {
                    // Open URL in embedded browser webview
                    await webviewProvider.showBrowser(objectName, urlResult);
                    return;
                }

                // Fall back to listing output files
                const filesResult = await execPython(
                    `shell.MANAGER.sub_object('${objectName}').list_output_files()`
                );

                // Parse files from result - format is (True, ['file1', 'file2', ...])
                const files = parseOutputFiles(filesResult);

                if (files.length === 0) {
                    vscode.window.showInformationMessage(`No output files found for ${objectName}`);
                    return;
                }

                // Show QuickPick with files
                const selected = await vscode.window.showQuickPick(files, {
                    placeHolder: `Select a file to view from ${objectName}`
                });

                if (selected) {
                    await execPython(`shell.MANAGER.sub_object('${objectName}').view('${selected}')`);
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    // Helper to parse output files from Python result
    function parseOutputFiles(result: string): string[] {
        try {
            // Match the list inside the tuple: (True, ['file1', 'file2'])
            const match = result.match(/\[([^\]]*)\]/);
            if (match) {
                const content = match[1];
                if (!content.trim()) return [];
                return content.split(',')
                    .map(f => f.trim().replace(/['"]/g, ''))
                    .filter(f => f);
            }
        } catch (e) {
            console.error('Failed to parse output files:', e);
        }
        return [];
    }

    // Register SCM provider (placeholder for future git integration)
    const scm = vscode.scm.createSourceControl('celebi', 'Celebi');
    context.subscriptions.push(scm);
}