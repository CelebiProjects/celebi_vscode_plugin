/**
 * Command registration entry point.
 *
 * Wires all three command groups (global, object, creation) into the
 * extension context. Each group receives the shared CommandDependencies.
 */
import * as vscode from 'vscode';
import { CelebiTreeProvider } from '../tree/treeProvider';
import { CelebiWebviewProvider } from '../webview';
import { MessageStore, MessagePanelProvider } from '../message/messagePanel';
import { registerGlobalCommands } from './globalCommands';
import { registerObjectCommands } from './objectCommands';
import { registerCreationCommands } from './creationCommands';

/** Shared dependencies injected into every command handler. */
export interface CommandDependencies {
    provider: CelebiTreeProvider;
    webviewProvider: CelebiWebviewProvider;
    messageStore: MessageStore;
    messagePanelProvider: MessagePanelProvider;
    outputChannel: vscode.OutputChannel;
    updateStatusBar: () => Promise<void>;
}

export function registerCommands(context: vscode.ExtensionContext, deps: CommandDependencies): void {
    registerGlobalCommands(context, deps);
    registerObjectCommands(context, deps);
    registerCreationCommands(context, deps);
}
