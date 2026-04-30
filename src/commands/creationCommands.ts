/**
 * Object creation and removal commands.
 *
 * createTask / createAlgorithm / createDirectory prompt for a name then
 * invoke the matching shell.mk* Python function.
 *
 * removeObject requires two confirmations (modal warning + type "REMOVE")
 * before deleting.
 *
 * viewResults tries to open an HTML view (impview) for a task; if none,
 * falls back to a file picker for output files.
 */
import * as vscode from 'vscode';
import { CommandDependencies } from './index';
import { getObjectNameFromArg, parseOutputFiles } from './utils';
import { execPython } from '../pythonRunner';

export function registerCreationCommands(context: vscode.ExtensionContext, deps: CommandDependencies): void {
    // ---- createTask ----
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.createTask', async (parentPathArg?: string) => {
            const parentPath = parentPathArg || '.';

            const taskName = await vscode.window.showInputBox({
                prompt: `Enter new task name (will be created in: ${parentPath === '.' ? 'project root' : parentPath})`,
                placeHolder: 'e.g., NewTask'
            });
            if (!taskName) { return; }

            try {
                const targetPath = parentPath === '.' ? taskName : `${parentPath}/${taskName}`;
                await execPython(`shell.mktask('${targetPath}')`);
                vscode.window.showInformationMessage(`Task '${taskName}' created successfully`);
                deps.provider.refresh();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    // ---- createAlgorithm ----
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.createAlgorithm', async (parentPathArg?: string) => {
            const parentPath = parentPathArg || '.';

            const algoName = await vscode.window.showInputBox({
                prompt: `Enter new algorithm name (will be created in: ${parentPath === '.' ? 'project root' : parentPath})`,
                placeHolder: 'e.g., NewAlgorithm'
            });
            if (!algoName) { return; }

            try {
                const targetPath = parentPath === '.' ? algoName : `${parentPath}/${algoName}`;
                await execPython(`shell.mkalgorithm('${targetPath}')`);
                vscode.window.showInformationMessage(`Algorithm '${algoName}' created successfully`);
                deps.provider.refresh();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    // ---- createDirectory ----
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.createDirectory', async (parentPathArg?: string) => {
            const parentPath = parentPathArg || '.';

            const dirName = await vscode.window.showInputBox({
                prompt: `Enter new directory name (will be created in: ${parentPath === '.' ? 'project root' : parentPath})`,
                placeHolder: 'e.g., NewDirectory'
            });
            if (!dirName) { return; }

            try {
                const targetPath = parentPath === '.' ? dirName : `${parentPath}/${dirName}`;
                await execPython(`shell.mkdir('${targetPath}')`);
                vscode.window.showInformationMessage(`Directory '${dirName}' created successfully`);
                deps.provider.refresh();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    // ---- removeObject (double confirmation) ----
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.removeObject', async (arg1?: string | { objectPath: string; objectType?: string }, arg2?: string) => {
            let targetName: string;
            let targetType: string;

            if (arg1 && typeof arg1 === 'object' && 'objectPath' in arg1) {
                const treeItem = arg1 as { objectPath: string; objectType?: string };
                const result = await getObjectNameFromArg(treeItem);
                targetName = result.objectName;
                targetType = treeItem.objectType || 'object';
            } else if (typeof arg1 === 'string') {
                targetName = arg1;
                targetType = arg2 || 'object';
            } else {
                targetName = '.';
                targetType = 'project';
            }

            // First: modal warning
            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to REMOVE this ${targetType}?\n\n"${targetName}"\n\nThis action CANNOT be undone and may delete files permanently!`,
                { modal: true },
                'Yes, Remove It',
                'Cancel'
            );

            if (confirm !== 'Yes, Remove It') {
                return;
            }

            // Second: type REMOVE to confirm
            const confirm2 = await vscode.window.showInputBox({
                prompt: `Type "REMOVE" to confirm deletion of ${targetType} "${targetName}"`,
                placeHolder: 'Type REMOVE'
            });

            if (confirm2 !== 'REMOVE') {
                vscode.window.showInformationMessage('Removal cancelled');
                return;
            }

            try {
                await execPython(`shell.MANAGER.sub_object('${targetName}').remove()`);
                vscode.window.showInformationMessage(`${targetType} '${targetName}' removed successfully`);
                deps.provider.refresh();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    // ---- viewResults (HTML impview or file picker) ----
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.viewResults', async (arg?: string | { objectPath: string }) => {
            try {
                let objectName: string;
                if (arg && typeof arg === 'object' && 'objectPath' in arg) {
                    const result = await getObjectNameFromArg(arg);
                    objectName = result.objectName;
                } else if (typeof arg === 'string') {
                    objectName = arg;
                } else {
                    objectName = '.';
                }

                // Try to open HTML view first
                const urlResult = await execPython(`shell.MANAGER.sub_object('${objectName}').impview()`);

                if (urlResult && urlResult.startsWith('http')) {
                    await deps.webviewProvider.showBrowser(objectName, urlResult);
                    return;
                }

                // Fallback: pick an output file
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
}
