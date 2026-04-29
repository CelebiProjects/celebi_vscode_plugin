import * as vscode from 'vscode';
import { Message, MessageStore } from './message/messageStore';
export { Message, MessageStore } from './message/messageStore';

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
            this.view.webview.html = this.getHtmlContent();
        } else {
            // Mark that we have pending updates for when the view is first shown
            this.pendingUpdate = true;
        }
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private getHtmlContent(): string {
        const nonce = this.getNonce();
        const messages = this.store.getHistory().reverse();
        const messagesHtml = messages
            .map(msg => this.renderMessage(msg))
            .join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <title>DITE Messages</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace;
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            padding: 8px;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        .header {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            margin-bottom: 8px;
            flex-shrink: 0;
        }
        .clear-btn {
            padding: 4px 8px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            transition: background 0.2s;
        }
        .clear-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .messages-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
            flex: 1;
            overflow-y: auto;
            min-height: 0;
        }
        .message {
            border-left: 3px solid var(--vscode-panel-border);
            padding: 8px 12px;
            background: var(--vscode-panel-background);
            border-radius: 3px;
        }
        .message.success {
            border-left-color: var(--vscode-testing-iconPassed);
        }
        .message.error {
            border-left-color: var(--vscode-errorForeground);
        }
        .command {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 4px;
        }
        .command::before {
            content: '$ ';
            color: var(--vscode-descriptionForeground);
        }
        .output {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            white-space: pre-wrap;
            word-wrap: break-word;
            margin-bottom: 4px;
        }
        .output.success::before {
            content: '✓ ';
            color: var(--vscode-testing-iconPassed);
            font-weight: bold;
        }
        .output.error::before {
            content: '✗ ';
            color: var(--vscode-errorForeground);
            font-weight: bold;
        }
        .timestamp {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        .empty-state {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            padding: 20px 8px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <button class="clear-btn" id="clearBtn" aria-label="Clear all messages">Clear</button>
    </div>
    <div class="messages-container">
        ${messagesHtml || '<div class="empty-state">No messages yet. Run a command to see output here.</div>'}
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        document.getElementById('clearBtn').addEventListener('click', function() {
            vscode.postMessage({ command: 'clear' });
        });
    </script>
</body>
</html>`;
    }

    private renderMessage(msg: Message): string {
        const time = msg.timestamp.toLocaleTimeString();
        const statusClass = msg.status;

        return `<div class="message ${statusClass}">
            <div class="command">${this.escapeHtml(msg.command)}</div>
            <div class="output ${statusClass}">${this.escapeHtml(msg.output)}</div>
            <div class="timestamp">${time}</div>
        </div>`;
    }

    private escapeHtml(text: string): string {
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
            '`': '&#96;'
        };
        return text.replace(/[&<>"'`]/g, m => map[m]);
    }
}
