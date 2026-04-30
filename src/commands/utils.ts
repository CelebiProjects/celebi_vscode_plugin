/**
 * Shared utilities used by command registration modules.
 *
 * Includes:
 *  - executeAndLog: run a Python expression and record result in the message panel
 *  - registerSimpleCommand / registerObjectAction: boilerplate-reducing helpers
 *  - String/path helpers: escapePythonString, getObjectNameFromArg, parseOutputFiles
 */
import * as vscode from 'vscode';
import { execPython } from '../pythonRunner';
import { MessageStore, MessagePanelProvider } from '../message/messagePanel';

// ---- Logging helper ----

/** Run a Python expression (via handler), log the result, and re-throw on error. */
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

// ---- Python string escaping ----

/** Escape single quotes in a string so it can be embedded in a Python shell expression. */
export function escapePythonString(str: string): string {
    return str.replace(/'/g, "\\'");
}

// ---- Object path resolution ----

/**
 * Resolve a VS Code tree item or string path into a relative object name.
 * Returns `objectName` (e.g. "subdir/Fit") and a human-readable `title`.
 */
export async function getObjectNameFromArg(arg: unknown): Promise<{ objectName: string; title: string }> {
    // Tree item argument (from context menu)
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

    // String path argument
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

// ---- Command registration helpers ----

/**
 * Register a simple exec+log command (no tree item, no input dialog).
 *
 * The handler runs a Python expression; result and errors are logged to the
 * message panel.  Use this for commands like showStatus, showTree, etc.
 */
export function registerSimpleCommand(
    context: vscode.ExtensionContext,
    commandId: string,
    label: string,
    handler: () => Promise<string>,
    loggers: { messageStore: MessageStore; messagePanelProvider: MessagePanelProvider },
    options?: { onSuccess?: () => void }
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

/**
 * Register a command that operates on a tree object.
 *
 * Guards against missing treeItem, resolves the relative object name,
 * runs the given Python method expression, and optionally refreshes the
 * tree view on success.
 *
 * @param pythonMethodExpr  A function that, given the escaped object name,
 *                          returns the full Python expression to execute.
 */
export function registerObjectAction(
    context: vscode.ExtensionContext,
    commandId: string,
    label: string,
    pythonMethodExpr: (escapedName: string) => string,
    loggers: { messageStore: MessageStore; messagePanelProvider: MessagePanelProvider },
    options?: { onSuccess?: () => void }
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
                return result;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );
}

// ---- Output file parsing ----

/**
 * Parse Python list_output_files() result.
 * Input format: (True, ['file1', 'file2', ...])
 * Returns the array of file name strings.
 */
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
