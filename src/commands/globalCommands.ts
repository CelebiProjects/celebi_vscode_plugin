import * as vscode from 'vscode';
import { CommandDependencies } from './index';
import { executeAndLog, escapePythonString, getObjectNameFromArg } from './utils';
import { execPython, execPythonInTerminal } from '../pythonRunner';

export function registerGlobalCommands(context: vscode.ExtensionContext, deps: CommandDependencies): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.runPythonPackage', async (pythonExpr: string) => {
            try {
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, pythonExpr, () => execPython(pythonExpr));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.runInTerminal', (pythonExpr: string) => {
            execPythonInTerminal(pythonExpr);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showOutput', () => {
            deps.outputChannel.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.refreshTree', () => {
            deps.provider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showDiteMessages', async () => {
            console.log('[DITE] Manually showing DITE Messages panel');
            console.log('[DITE] messagePanelProvider exists:', !!deps.messagePanelProvider);
            console.log('[DITE] messageStore history:', deps.messageStore.getHistory().length);
            console.log('[DITE] resolve count:', deps.messagePanelProvider.getResolveCount());

            try {
                const panel = vscode.window.createWebviewPanel(
                    'diteMessagePanel',
                    'DITE Messages',
                    vscode.ViewColumn.Beside,
                    {}
                );
                console.log('[DITE] Created fallback webview panel');

                const messages = deps.messageStore.getHistory();
                const messagesHtml = messages.length > 0
                    ? messages.map((msg) => `
                        <div style="border-left: 3px solid ${msg.status === 'success' ? '#4ec9b0' : '#f48771'}; padding: 8px 12px; margin-bottom: 12px; background: var(--vscode-panel-background);">
                            <div style="font-family: monospace; font-size: 12px; color: var(--vscode-textLink-foreground); margin-bottom: 4px;">$ ${msg.command}</div>
                            <div style="font-family: monospace; font-size: 12px; white-space: pre-wrap;">${msg.status === 'success' ? '✓' : '✗'} ${msg.output}</div>
                        </div>
                    `).join('')
                    : '<div style="text-align: center; color: var(--vscode-descriptionForeground); padding: 20px;">No messages yet</div>';

                panel.webview.html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <style>
                            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; background: var(--vscode-editor-background); color: var(--vscode-foreground); padding: 8px; }
                        </style>
                    </head>
                    <body>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--vscode-panel-border);">
                            <h2 style="font-size: 12px; font-weight: 600;">DITE Messages</h2>
                        </div>
                        ${messagesHtml}
                    </body>
                    </html>`;

                console.log('[DITE] Fallback panel HTML set');
            } catch (error) {
                console.error('[DITE] Failed to create fallback panel:', error);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.clearMessages', () => {
            deps.messageStore.clear();
            deps.messagePanelProvider.updateWebview();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.refreshDite', async () => {
            try {
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, 'refreshDite', () => execPython('shell.MANAGER.current_object().printed_dite_status()'));
                deps.provider.refresh();
                vscode.window.showInformationMessage(`DITE status refreshed`);
            } catch (error) {
                deps.provider.refresh();
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi DITE: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.openObject', async (objectPath: string) => {
            try {
                const pythonExpr = `shell.MANAGER.sub_object('${escapePythonString(objectPath)}').status()`;
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, `open ${objectPath}`, () => execPython(pythonExpr));
                vscode.window.showInformationMessage(`Object status displayed`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.submit', async () => {
            const objectName = await vscode.window.showInputBox({
                prompt: 'Enter object name to submit (or leave empty for current)',
                placeHolder: 'e.g., FitTask'
            });
            if (objectName === undefined) { return; }

            const pythonExpr = objectName
                ? `shell.MANAGER.sub_object('${escapePythonString(objectName)}').submit()`
                : 'shell.submit()';

            const commandName = objectName ? `submit ${objectName}` : 'submit';

            try {
                const result = await executeAndLog(deps.messageStore, deps.messagePanelProvider, commandName, () => execPython(pythonExpr));
                deps.provider.refresh();
                vscode.window.showInformationMessage(`Task submitted: ${result}`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

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
                ? `shell.MANAGER.sub_object('${escapePythonString(objectName)}').impress('${escapePythonString(impression)}')`
                : `shell.MANAGER.sub_object('${escapePythonString(objectName)}').impress()`;

            const commandName = impression ? `impress ${objectName} ${impression}` : `impress ${objectName}`;

            try {
                const result = await executeAndLog(deps.messageStore, deps.messagePanelProvider, commandName, () => execPython(pythonExpr));
                deps.provider.refresh();
                vscode.window.showInformationMessage(`Impression created: ${result}`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.switchProject', async () => {
            try {
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
                    await executeAndLog(deps.messageStore, deps.messagePanelProvider, `switch project to ${selected}`, () => execPython(`shell.MANAGER.switch_project('${escapePythonString(selected)}')`));
                    deps.provider.refresh();
                    deps.updateStatusBar();
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.execute', async () => {
            const command = await vscode.window.showInputBox({
                prompt: 'Enter shell function to execute',
                placeHolder: 'e.g., shell.tree() or shell.ls()'
            });
            if (!command) { return; }

            try {
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, command, () => execPython(command));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showStatus', async () => {
            try {
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, 'show status', () => execPython('shell.status()'));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showTree', async () => {
            try {
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, 'show tree', () => execPython('shell.tree()'));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showJobs', async () => {
            try {
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, 'show jobs', () => execPython('shell.jobs()'));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showLs', async (arg?: unknown) => {
            try {
                const { objectName, title } = await getObjectNameFromArg(arg);
                const result = await executeAndLog(deps.messageStore, deps.messagePanelProvider, `ls ${objectName}`, () => execPython(`shell.MANAGER.sub_object('${escapePythonString(objectName)}').ls()`));
                await deps.webviewProvider.showLsView(title, result);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showTrace', async (objectName?: string) => {
            await deps.webviewProvider.showTraceView(objectName);
        })
    );

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
}
