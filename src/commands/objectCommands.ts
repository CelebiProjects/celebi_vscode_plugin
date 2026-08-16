/**
 * Tree object-level commands (triggered from object context menus).
 *
 * Most commands follow the same pattern: guard treeItem, resolve object name
 * from the project root, run a Python shell method, and log the result.
 * registerObjectAction() handles that boilerplate.
 */
import * as vscode from 'vscode';
import { CommandDependencies } from './index';
import { executeAndLog, escapePythonString, getObjectNameFromArg, parseOutputFiles, registerObjectAction } from './utils';
import { execPython } from '../pythonRunner';

export function registerObjectCommands(context: vscode.ExtensionContext, deps: CommandDependencies): void {
    const log = { messageStore: deps.messageStore, messagePanelProvider: deps.messagePanelProvider };

    // ---- Simple object actions (all follow the same pattern) ----
    registerObjectAction(context, 'celebi.objectStatus',    'status',       n => `shell.MANAGER.sub_object('${n}').printed_status()`,             log);
    registerObjectAction(context, 'celebi.objectTree',      'tree',         n => `shell.MANAGER.sub_object('${n}').tree()`,               log);
    registerObjectAction(context, 'celebi.objectJobs',      'jobs',         n => `shell.MANAGER.sub_object('${n}').jobs()`,               log);
    registerObjectAction(context, 'celebi.objectChanges',   'changes',      n => `shell.MANAGER.sub_object('${n}').changes()`,            log);
    registerObjectAction(context, 'celebi.objectHistory',   'history',      n => `shell.MANAGER.sub_object('${n}').history()`,            log);
    registerObjectAction(context, 'celebi.objectSubmit',    'submit',       n => `shell.MANAGER.sub_object('${n}').submit()`,             log, { onSuccess: () => deps.provider.refresh() });
    registerObjectAction(context, 'celebi.objectJob',       'job status',   n => `shell.MANAGER.sub_object('${n}').job_status()`,         log);
    registerObjectAction(context, 'celebi.objectResubmit',  'resubmit',     n => `shell.MANAGER.sub_object('${n}').resubmit()`,           log, { onSuccess: () => deps.provider.refresh() });
    registerObjectAction(context, 'celebi.objectPre',       'predecessors', n => `shell.MANAGER.sub_object('${n}').show_predecessors()`,  log);
    registerObjectAction(context, 'celebi.objectSuc',       'successors',   n => `shell.MANAGER.sub_object('${n}').show_successors()`,    log);
    registerObjectAction(context, 'celebi.objectCat',       'cat',          n => `shell.MANAGER.sub_object('${n}').cat()`,                log);

    // ---- objectResults: show browser view or file picker ----
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.objectResults', async (treeItem?: { objectPath: string }) => {
            if (!treeItem) return;
            try {
                const { objectName } = await getObjectNameFromArg(treeItem);
                // Try to open an HTML view (impview) first
                const urlResult = await execPython(`shell.MANAGER.sub_object('${objectName}').impview()`);
                if (urlResult && urlResult.startsWith('http')) {
                    await deps.webviewProvider.showBrowser(objectName, urlResult);
                    return;
                }
                // Fallback: list output files and let the user pick one
                const filesResult = await execPython(`shell.MANAGER.sub_object('${objectName}').list_output_files()`);
                const files = parseOutputFiles(filesResult);
                if (files.length === 0) {
                    vscode.window.showInformationMessage(`No output files found for ${objectName}`);
                    return;
                }
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

    // ---- objectRun: prompt for a command and execute it on the object ----
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.objectRun', async (treeItem?: { objectPath: string }) => {
            if (!treeItem) return;
            try {
                const { objectName } = await getObjectNameFromArg(treeItem);
                const command = await vscode.window.showInputBox({
                    prompt: `Run command on ${objectName}`,
                    placeHolder: 'e.g., .submit() or .ls()'
                });
                if (!command) return;
                const pythonExpr = command.startsWith('.')
                    ? `shell.MANAGER.sub_object('${escapePythonString(objectName)}')${command}`
                    : command;
                await executeAndLog(deps.messageStore, deps.messagePanelProvider,
                    `run ${objectName}${command.startsWith('.') ? command : ''}`,
                    () => execPython(pythonExpr));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    // ---- objectImpress: needs an impression name from the user ----
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.objectImpress', async (treeItem?: { objectPath: string }) => {
            if (!treeItem) return;
            try {
                const { objectName } = await getObjectNameFromArg(treeItem);
                const impression = await vscode.window.showInputBox({
                    prompt: 'Enter impression name (optional)',
                    placeHolder: 'e.g., v1.0'
                });
                if (!impression) { return; }
                await executeAndLog(deps.messageStore, deps.messagePanelProvider,
                    `impress ${objectName} ${impression}`,
                    () => execPython(`shell.MANAGER.sub_object('${escapePythonString(objectName)}').impress('${escapePythonString(impression)}')`));
                deps.provider.refresh();
                vscode.window.showInformationMessage(`Impression created: ${objectName}@${impression}`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );
}
