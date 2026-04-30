import * as vscode from 'vscode';
import { CelebiTreeProvider } from './tree/treeProvider';
import { execPython, getOutputChannel } from './pythonRunner';
import { CelebiWebviewProvider } from './webview';
import { MessageStore } from './message/messageStore';
import { MessagePanelProvider } from './message/messagePanel';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext) {
    console.log('[DITE] Extension activating...');

    const outputChannel = getOutputChannel();
    context.subscriptions.push(outputChannel);

    const messageStore = new MessageStore();
    console.log('[DITE] MessageStore created');
    const messagePanelProvider = new MessagePanelProvider(messageStore);
    console.log('[DITE] MessagePanelProvider created');

    try {
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                MessagePanelProvider.viewType,
                messagePanelProvider,
                {
                    webviewOptions: {
                        retainContextWhenHidden: true
                    }
                }
            )
        );
        console.log('[DITE] WebviewViewProvider registered successfully');
    } catch (error) {
        console.error('[DITE] Failed to register WebviewViewProvider:', error);
    }
    context.subscriptions.push(messagePanelProvider);

    const provider = new CelebiTreeProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('celebiTreeView', provider)
    );

    const webviewProvider = new CelebiWebviewProvider();

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'celebi.showOutput';
    context.subscriptions.push(statusBarItem);

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

    const config = vscode.workspace.getConfiguration('celebi');
    const projectPath = config.get<string>('projectPath', '') ||
                        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (projectPath) {
        const celebiWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(projectPath, '.celebi/**/*')
        );
        celebiWatcher.onDidChange(() => provider.refresh());
        celebiWatcher.onDidCreate(() => provider.refresh());
        celebiWatcher.onDidDelete(() => provider.refresh());
        context.subscriptions.push(celebiWatcher);

        const impressWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(projectPath, '**/impressions/**/*')
        );
        impressWatcher.onDidChange(() => provider.refresh());
        impressWatcher.onDidCreate(() => provider.refresh());
        context.subscriptions.push(impressWatcher);
    }

    registerCommands(context, {
        provider,
        webviewProvider,
        messageStore,
        messagePanelProvider,
        outputChannel,
        updateStatusBar
    });

    const scm = vscode.scm.createSourceControl('celebi', 'Celebi');
    context.subscriptions.push(scm);
}
