/**
 * Project-level commands that don't target a specific tree object.
 *
 * Includes: runPythonPackage, submit, impress, switchProject,
 * execute, showStatus / showTree / showJobs / showLs,
 * gitStatus, gitHistory, DITE status/messages, and utilities.
 */
import * as vscode from 'vscode';
import { CommandDependencies } from './index';
import { executeAndLog, escapePythonString, getObjectNameFromArg, registerSimpleCommand } from './utils';
import { renderMarkdown } from '../formatOutput';
import { execPython, execPythonInTerminal, resolveServerProfile } from '../pythonRunner';

export function registerGlobalCommands(context: vscode.ExtensionContext, deps: CommandDependencies): void {
    const log = { messageStore: deps.messageStore, messagePanelProvider: deps.messagePanelProvider };

    // ---- Trivial commands (no logging) ----

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.runPythonPackage', async (pythonExpr: string) => {
            try {
                await executeAndLog(log.messageStore, log.messagePanelProvider, pythonExpr, () => execPython(pythonExpr));
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
        vscode.commands.registerCommand('celebi.showOutput', () => deps.outputChannel.show())
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.refreshTree', () => deps.provider.refresh())
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.clearMessages', () => {
            deps.messageStore.clear();
            deps.messagePanelProvider.updateWebview();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showTrace', async (objectName?: string) => {
            await deps.webviewProvider.showTraceView(objectName);
        })
    );

    // ---- Server switching ----

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.switchServer', async () => {
            const config = vscode.workspace.getConfiguration('celebi');
            const servers = config.get<Record<string, unknown>>('servers', {});
            const names = Object.keys(servers);

            if (names.length === 0) {
                vscode.window.showInformationMessage(
                    'No server profiles defined. Add them in settings.json under "celebi.servers".'
                );
                return;
            }

            const current = resolveServerProfile();
            const items = names.map(n => ({
                label: n,
                description: current?.name === n ? '(active)' : '',
                detail: (servers[n] as { host?: string })?.host ? `ssh ${(servers[n] as { host: string }).host}` : 'local'
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a server profile'
            });

            if (selected) {
                await config.update('activeServer', selected.label, vscode.ConfigurationTarget.Global);
                deps.provider.refresh();
                deps.updateStatusBar();
                vscode.window.showInformationMessage(`Switched to server: ${selected.label}`);
            }
        })
    );

    // ---- Simple exec+log commands (via registerSimpleCommand) ----

    registerSimpleCommand(context, 'celebi.showStatus', 'show status',
        () => execPython('shell.status()'), log);
    registerSimpleCommand(context, 'celebi.showTree',   'show tree',
        () => execPython('shell.tree()'),   log);
    registerSimpleCommand(context, 'celebi.showJobs',   'show jobs',
        () => execPython('shell.jobs()'),   log);

    registerSimpleCommand(context, 'celebi.refreshDite', 'refreshDite',
        () => execPython('shell.MANAGER.current_object().printed_dite_status()'), log,
        { onSuccess: () => deps.provider.refresh() });

    // ---- Git commands ----

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.gitStatus', async () => {
            try { await execPython('shell.changes()'); }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.gitHistory', async () => {
            try { await execPython('shell.history()'); }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    // ---- Commands with input dialogs ----

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.openObject', async (objectPath: string) => {
            try {
                const pythonExpr = `shell.MANAGER.sub_object('${escapePythonString(objectPath)}').status()`;
                await executeAndLog(log.messageStore, log.messagePanelProvider, `open ${objectPath}`,
                    () => execPython(pythonExpr));
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
            if (objectName === undefined) return;

            const pythonExpr = objectName
                ? `shell.MANAGER.sub_object('${escapePythonString(objectName)}').submit()`
                : 'shell.submit()';
            const commandName = objectName ? `submit ${objectName}` : 'submit';

            try {
                const result = await executeAndLog(deps.messageStore, deps.messagePanelProvider, commandName,
                    () => execPython(pythonExpr));
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
                prompt: 'Enter object name to impress', placeHolder: 'e.g., Fit'
            });
            if (!objectName) return;

            const impression = await vscode.window.showInputBox({
                prompt: 'Enter impression name', placeHolder: 'e.g., v1.0'
            });

            const pythonExpr = impression
                ? `shell.MANAGER.sub_object('${escapePythonString(objectName)}').impress('${escapePythonString(impression)}')`
                : `shell.MANAGER.sub_object('${escapePythonString(objectName)}').impress()`;
            const commandName = impression ? `impress ${objectName} ${impression}` : `impress ${objectName}`;

            try {
                const result = await executeAndLog(deps.messageStore, deps.messagePanelProvider, commandName,
                    () => execPython(pythonExpr));
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
                    .replace(/[\[\]'"]/g, '').split(',').map(p => p.trim()).filter(p => p);

                const selected = await vscode.window.showQuickPick(projects, {
                    placeHolder: 'Select a project to switch to'
                });

                if (selected) {
                    await executeAndLog(deps.messageStore, deps.messagePanelProvider,
                        `switch project to ${selected}`,
                        () => execPython(`shell.MANAGER.switch_project('${escapePythonString(selected)}')`));
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
            if (!command) return;

            try {
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, command,
                    () => execPython(command));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showLs', async (arg?: unknown) => {
            try {
                console.log('[DEBUG showLs] arg:', arg);
                const { objectName, title } = await getObjectNameFromArg(arg);
                console.log('[DEBUG showLs] objectName:', objectName, 'title:', title);
                const pyExpr = `shell.MANAGER.sub_object('${escapePythonString(objectName)}').ls(LsParameters(readme=False))`;
                console.log('[DEBUG showLs] pythonExpr:', pyExpr);
                const result = await execPython(pyExpr);
                console.log('[DEBUG showLs] result length:', result?.length, 'first 200 chars:', result?.substring(0, 200));
                deps.messageStore.addMessage(`ls ${objectName}`, 'Directory listing loaded', 'success');
                deps.messagePanelProvider.updateWebview();
                await deps.webviewProvider.showLsView(title, result);
                console.log('[DEBUG showLs] webview shown');
            } catch (error) {
                console.error('[DEBUG showLs] error:', error);
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showReadme', async (arg?: unknown) => {
            try {
                console.log('[DEBUG showReadme] arg:', arg);
                const { objectName, title } = await getObjectNameFromArg(arg);
                console.log('[DEBUG showReadme] objectName:', objectName, 'title:', title);

                // Run readme → webview and ls (without readme) → sidebar, in parallel
                const readmePy = `shell.MANAGER.sub_object('${escapePythonString(objectName)}').readme()`;
                const lsPy = `shell.MANAGER.sub_object('${escapePythonString(objectName)}').ls(LsParameters(readme=False))`;
                const [readmeResult, lsResult] = await Promise.all([
                    execPython(readmePy),
                    execPython(lsPy)
                ]);
                console.log('[DEBUG showReadme] readme length:', readmeResult?.length);
                console.log('[DEBUG showReadme] ls length:', lsResult?.length);

                // Show README in webview
                const html = renderMarkdown(readmeResult);
                console.log('[DEBUG showReadme] html length:', html?.length);
                await deps.webviewProvider.showReadmeView(title, html);

                // Show ls output in Information sidebar panel
                deps.messageStore.addMessage(`ls ${objectName}`, lsResult, 'success');
                deps.messagePanelProvider.updateWebview();
                console.log('[DEBUG showReadme] done');
            } catch (error) {
                console.error('[DEBUG showReadme] error:', error);
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    // ---- DITE Messages panel (inline HTML fallback) ----

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showDiteMessages', async () => {
            try {
                const panel = vscode.window.createWebviewPanel(
                    'diteMessagePanel', 'DITE Messages', vscode.ViewColumn.Beside, {}
                );

                const messages = deps.messageStore.getHistory();
                const messagesHtml = messages.length > 0
                    ? messages.map((msg) => `
                        <div style="border-left: 3px solid ${msg.status === 'success' ? '#4ec9b0' : '#f48771'}; padding: 8px 12px; margin-bottom: 12px; background: var(--vscode-panel-background);">
                            <div style="font-family: monospace; font-size: 12px; color: var(--vscode-textLink-foreground); margin-bottom: 4px;">$ ${msg.command}</div>
                            <div style="font-family: monospace; font-size: 12px; white-space: pre-wrap;">${msg.status === 'success' ? '✓' : '✗'} ${msg.output}</div>
                        </div>`).join('')
                    : '<div style="text-align: center; color: var(--vscode-descriptionForeground); padding: 20px;">No messages yet</div>';

                panel.webview.html = `<!DOCTYPE html>
                    <html><head><meta charset="UTF-8">
                    <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace;background:var(--vscode-editor-background);color:var(--vscode-foreground);padding:8px;}</style>
                    </head><body>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--vscode-panel-border);">
                    <h2 style="font-size:12px;font-weight:600;">DITE Messages</h2></div>
                    ${messagesHtml}</body></html>`;
            } catch (error) {
                console.error('Failed to create DITE Messages panel:', error);
            }
        })
    );
}
