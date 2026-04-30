import * as vscode from 'vscode';
import { CommandDependencies } from './index';
import { executeAndLog, escapePythonString, getObjectNameFromArg, parseOutputFiles } from './utils';
import { execPython } from '../pythonRunner';

export function registerObjectCommands(context: vscode.ExtensionContext, deps: CommandDependencies): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.objectStatus', async (treeItem?: { objectPath: string }) => {
            if (!treeItem) return;
            try {
                const { objectName } = await getObjectNameFromArg(treeItem);
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, `status ${objectName}`, () => execPython(`shell.MANAGER.sub_object('${escapePythonString(objectName)}').status()`));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.objectTree', async (treeItem?: { objectPath: string }) => {
            if (!treeItem) return;
            try {
                const { objectName } = await getObjectNameFromArg(treeItem);
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, `tree ${objectName}`, () => execPython(`shell.MANAGER.sub_object('${escapePythonString(objectName)}').tree()`));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.objectJobs', async (treeItem?: { objectPath: string }) => {
            if (!treeItem) return;
            try {
                const { objectName } = await getObjectNameFromArg(treeItem);
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, `jobs ${objectName}`, () => execPython(`shell.MANAGER.sub_object('${escapePythonString(objectName)}').jobs()`));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.objectChanges', async (treeItem?: { objectPath: string }) => {
            if (!treeItem) return;
            try {
                const { objectName } = await getObjectNameFromArg(treeItem);
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, `changes ${objectName}`, () => execPython(`shell.MANAGER.sub_object('${escapePythonString(objectName)}').changes()`));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.objectHistory', async (treeItem?: { objectPath: string }) => {
            if (!treeItem) return;
            try {
                const { objectName } = await getObjectNameFromArg(treeItem);
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, `history ${objectName}`, () => execPython(`shell.MANAGER.sub_object('${escapePythonString(objectName)}').history()`));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.objectSubmit', async (treeItem?: { objectPath: string }) => {
            if (!treeItem) return;
            try {
                const { objectName } = await getObjectNameFromArg(treeItem);
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, `submit ${objectName}`, () => execPython(`shell.MANAGER.sub_object('${escapePythonString(objectName)}').submit()`));
                deps.provider.refresh();
                vscode.window.showInformationMessage(`Task submitted: ${objectName}`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.objectJob', async (treeItem?: { objectPath: string }) => {
            if (!treeItem) return;
            try {
                const { objectName } = await getObjectNameFromArg(treeItem);
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, `job status ${objectName}`, () => execPython(`shell.MANAGER.sub_object('${escapePythonString(objectName)}').job_status()`));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.objectResubmit', async (treeItem?: { objectPath: string }) => {
            if (!treeItem) return;
            try {
                const { objectName } = await getObjectNameFromArg(treeItem);
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, `resubmit ${objectName}`, () => execPython(`shell.MANAGER.sub_object('${escapePythonString(objectName)}').resubmit()`));
                deps.provider.refresh();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.objectResults', async (treeItem?: { objectPath: string }) => {
            if (!treeItem) return;
            try {
                const { objectName } = await getObjectNameFromArg(treeItem);
                const urlResult = await execPython(`shell.MANAGER.sub_object('${objectName}').impview()`);
                if (urlResult && urlResult.startsWith('http')) {
                    await deps.webviewProvider.showBrowser(objectName, urlResult);
                    return;
                }
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
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, `impress ${objectName} ${impression}`, () => execPython(`shell.MANAGER.sub_object('${escapePythonString(objectName)}').impress('${escapePythonString(impression)}')`));
                deps.provider.refresh();
                vscode.window.showInformationMessage(`Impression created: ${objectName}@${impression}`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.objectPre', async (treeItem?: { objectPath: string }) => {
            if (!treeItem) return;
            try {
                const { objectName } = await getObjectNameFromArg(treeItem);
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, `predecessors ${objectName}`, () => execPython(`shell.MANAGER.sub_object('${escapePythonString(objectName)}').show_predecessors()`));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.objectSuc', async (treeItem?: { objectPath: string }) => {
            if (!treeItem) return;
            try {
                const { objectName } = await getObjectNameFromArg(treeItem);
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, `successors ${objectName}`, () => execPython(`shell.MANAGER.sub_object('${escapePythonString(objectName)}').show_successors()`));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.objectCat', async (treeItem?: { objectPath: string }) => {
            if (!treeItem) return;
            try {
                const { objectName } = await getObjectNameFromArg(treeItem);
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, `cat ${objectName}`, () => execPython(`shell.MANAGER.sub_object('${escapePythonString(objectName)}').cat()`));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );
}