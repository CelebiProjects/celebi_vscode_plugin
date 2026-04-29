import * as vscode from 'vscode';
import { Message, MessageStore } from './message/messageStore';
export { Message, MessageStore } from './message/messageStore';
import { getHtmlContent } from './message/messageHtml';

export class MessagePanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'diteMessagePanel';
    private view?: vscode.WebviewView;
    private store: MessageStore;
    private disposables: vscode.Disposable[] = [];
    private disposed = false;
    private pendingUpdate = false;
    private resolveCount = 0;

    constructor(store: MessageStore) {
        this.store = store;
        // Debug: log resolve count every 5 seconds
        console.log('[DITE] Setting up timer');
        setInterval(() => {
            console.log(`[DITE] Timer: resolveCount=${this.resolveCount}, viewExists=${!!this.view}`);
        }, 5000);
        console.log('[DITE] Timer setup complete');
    }

    public getResolveCount(): number {
        return this.resolveCount;
    }

    public dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.view = undefined;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this.resolveCount++;
        console.log(`[DITE] resolveWebviewView called (count: ${this.resolveCount})`);
        console.log(`[DITE] webviewView visible: ${webviewView.visible}`);
        this.view = webviewView;

        // Listen for visibility changes
        this.disposables.push(
            webviewView.onDidChangeVisibility(() => {
                console.log(`[DITE] Visibility changed: ${webviewView.visible}`);
                if (webviewView.visible) {
                    this.updateWebview();
                }
            })
        );
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: []
        };

        // If there were updates before the view was ready, apply them now
        if (this.pendingUpdate) {
            console.log('[DITE] Applying pending update');
            this.updateWebview();
            this.pendingUpdate = false;
        } else {
            console.log('[DITE] Updating webview for first time');
            this.updateWebview();
        }

        // Handle messages from webview
        this.disposables.push(
            webviewView.webview.onDidReceiveMessage(message => {
                try {
                    if (message.command === 'clear') {
                        this.store.clear();
                        this.updateWebview();
                    }
                } catch (error) {
                    console.error('Error handling webview message:', error);
                }
            })
        );

        this.disposables.push(
            webviewView.onDidDispose(() => {
                this.dispose();
            })
        );
    }

    public updateWebview(): void {
        if (this.view) {
            this.view.webview.html = getHtmlContent(this.store.getHistory());
        } else {
            // Mark that we have pending updates for when the view is first shown
            this.pendingUpdate = true;
        }
    }
}
