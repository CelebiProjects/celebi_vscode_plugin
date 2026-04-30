import * as vscode from 'vscode';
import { Message, MessageStore } from './messageStore';
export { Message, MessageStore } from './messageStore';
import { getHtmlContent } from './messageHtml';

export class MessagePanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'diteMessagePanel';
    private view?: vscode.WebviewView;
    private store: MessageStore;
    private disposables: vscode.Disposable[] = [];
    private pendingUpdate = false;

    constructor(store: MessageStore) {
        this.store = store;
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.view = undefined;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this.view = webviewView;

        this.disposables.push(
            webviewView.onDidChangeVisibility(() => {
                if (webviewView.visible) {
                    this.updateWebview();
                }
            })
        );
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: []
        };

        if (this.pendingUpdate) {
            this.updateWebview();
            this.pendingUpdate = false;
        } else {
            this.updateWebview();
        }

        this.disposables.push(
            webviewView.webview.onDidReceiveMessage(message => {
                switch (message.command) {
                    case 'clear':
                        this.store.clear();
                        this.updateWebview();
                        break;
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
            this.pendingUpdate = true;
        }
    }
}
