import * as vscode from 'vscode';
import { execPython } from '../pythonRunner';
import { MessageStore, MessagePanelProvider } from '../message/messagePanel';

export async function executeAndLog(
    messageStore: MessageStore,
    messagePanelProvider: MessagePanelProvider,
    commandName: string,
    handler: () => Promise<string>
): Promise<string> {
    try {
        const result = await handler();
        messageStore.addMessage(commandName, result, 'success');
        messagePanelProvider.updateWebview();
        return result;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        messageStore.addMessage(commandName, errorMsg, 'error');
        messagePanelProvider.updateWebview();
        throw error;
    }
}

export function escapePythonString(str: string): string {
    return str.replace(/'/g, "\\'");
}

export async function getObjectNameFromArg(arg: unknown): Promise<{ objectName: string; title: string }> {
    if (arg && typeof arg === 'object' && 'objectPath' in arg) {
        const treeItem = arg as { objectPath: string; label?: string };
        const objectPath = treeItem.objectPath;
        const projectPath = await execPython('shell.MANAGER.current_object().path');

        if (objectPath === projectPath) {
            return { objectName: '.', title: 'Project Root' };
        } else if (objectPath.startsWith(projectPath + '/')) {
            const name = objectPath.substring(projectPath.length + 1);
            return { objectName: name, title: name };
        } else {
            const name = objectPath.split('/').pop() || objectPath;
            return { objectName: name, title: name };
        }
    }

    if (typeof arg === 'string') {
        const projectPath = await execPython('shell.MANAGER.current_object().path');
        if (arg === projectPath) {
            return { objectName: '.', title: 'Project Root' };
        } else if (arg.startsWith(projectPath + '/')) {
            const name = arg.substring(projectPath.length + 1);
            return { objectName: name, title: name };
        } else {
            const name = arg.split('/').pop() || arg;
            return { objectName: name, title: name };
        }
    }

    return { objectName: '.', title: 'Current Directory' };
}

export function registerSimpleCommand(
    context: vscode.ExtensionContext,
    commandId: string,
    label: string,
    handler: () => Promise<string>,
    loggers: { messageStore: MessageStore; messagePanelProvider: MessagePanelProvider },
    options?: { onSuccess?: () => void; silent?: boolean }
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(commandId, async () => {
            try {
                const result = await executeAndLog(loggers.messageStore, loggers.messagePanelProvider, label, handler);
                options?.onSuccess?.();
                return result;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );
}

export function registerObjectAction(
    context: vscode.ExtensionContext,
    commandId: string,
    label: string,
    pythonMethodExpr: (objectName: string) => string,
    loggers: { messageStore: MessageStore; messagePanelProvider: MessagePanelProvider },
    options?: { onSuccess?: () => void; showInfo?: string }
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(commandId, async (treeItem?: { objectPath: string }) => {
            if (!treeItem) return;
            try {
                const { objectName } = await getObjectNameFromArg(treeItem);
                const result = await executeAndLog(
                    loggers.messageStore, loggers.messagePanelProvider,
                    `${label} ${objectName}`,
                    () => execPython(pythonMethodExpr(escapePythonString(objectName)))
                );
                options?.onSuccess?.();
                if (options?.showInfo) {
                    vscode.window.showInformationMessage(options.showInfo.replace('{name}', objectName));
                }
                return result;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );
}

export function parseOutputFiles(result: string): string[] {
    try {
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
