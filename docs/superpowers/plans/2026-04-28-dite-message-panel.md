# DITE Message Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a webview panel embedded in the Celebi view container that displays command-output pairs from executed commands.

**Architecture:** A MessageStore (in-memory) tracks commands and outputs. A WebviewViewProvider renders this history in an HTML panel. Command handlers are wrapped to capture executions and log them to the store.

**Tech Stack:** VS Code API (WebviewViewProvider), TypeScript, HTML/CSS, existing Python runner

---

## File Structure

```
src/
  messagePanel.ts       [NEW] MessageStore + MessagePanelProvider classes
  messagePanel.html     [NEW] HTML template for webview
  extension.ts          [MODIFY] Initialize message panel, wrap commands
  pythonRunner.ts       [NO CHANGE] Existing code stays as-is
  
package.json            [MODIFY] Add view registration + clearMessages command
```

---

## Task 1: Create MessageStore class

**Files:**
- Create: `src/messagePanel.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// This won't compile yet - that's expected
import { MessageStore } from './messagePanel';

function testMessageStoreAddMessage() {
    const store = new MessageStore();
    store.addMessage('submit FitTask', '✓ Task submitted', 'success');
    const history = store.getHistory();
    
    if (history.length !== 1) {
        throw new Error('Expected 1 message');
    }
    if (history[0].command !== 'submit FitTask') {
        throw new Error('Command mismatch');
    }
}

function testMessageStoreClear() {
    const store = new MessageStore();
    store.addMessage('submit FitTask', '✓ Task submitted', 'success');
    store.clear();
    const history = store.getHistory();
    
    if (history.length !== 0) {
        throw new Error('Expected 0 messages after clear');
    }
}

// Run tests
testMessageStoreAddMessage();
testMessageStoreClear();
console.log('All tests passed');
```

Save this as `src/test/messagePanel.test.ts` (create test directory if needed)

- [ ] **Step 2: Create the MessageStore class skeleton**

Create `src/messagePanel.ts`:

```typescript
export interface Message {
    command: string;
    output: string;
    timestamp: Date;
    status: 'success' | 'error';
}

export class MessageStore {
    private messages: Message[] = [];

    addMessage(command: string, output: string, status: 'success' | 'error'): void {
        this.messages.push({
            command,
            output,
            timestamp: new Date(),
            status
        });
    }

    clear(): void {
        this.messages = [];
    }

    getHistory(): Message[] {
        return [...this.messages];
    }
}
```

- [ ] **Step 3: Run the test to verify it passes**

```bash
npx ts-node src/test/messagePanel.test.ts
```

Expected output: `All tests passed`

- [ ] **Step 4: Commit**

```bash
git add src/messagePanel.ts src/test/messagePanel.test.ts
git commit -m "feat: add MessageStore class for command history"
```

---

## Task 2: Create MessagePanelProvider class

**Files:**
- Modify: `src/messagePanel.ts`

- [ ] **Step 1: Add the MessagePanelProvider class**

Append to `src/messagePanel.ts` (after the MessageStore class):

```typescript
import * as vscode from 'vscode';

export class MessagePanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'diteMessagePanel';
    private view?: vscode.WebviewView;
    private store: MessageStore;

    constructor(store: MessageStore) {
        this.store = store;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: []
        };
        this.updateWebview();

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(message => {
            if (message.command === 'clear') {
                this.store.clear();
                this.updateWebview();
            }
        });
    }

    public updateWebview(): void {
        if (this.view) {
            this.view.webview.html = this.getHtmlContent();
        }
    }

    private getHtmlContent(): string {
        const messages = this.store.getHistory();
        const messagesHtml = messages
            .map(msg => this.renderMessage(msg))
            .join('');

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .header h2 {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
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
            max-height: calc(100vh - 100px);
            overflow-y: auto;
        }
        .message {
            border-left: 3px solid var(--vscode-panel-border);
            padding: 8px 12px;
            background: var(--vscode-panel-background);
            border-radius: 3px;
        }
        .message.success {
            border-left-color: #4ec9b0;
        }
        .message.error {
            border-left-color: #f48771;
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
            color: #4ec9b0;
            font-weight: bold;
        }
        .output.error::before {
            content: '✗ ';
            color: #f48771;
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
        <h2>DITE Messages</h2>
        <button class="clear-btn" onclick="clearMessages()">Clear</button>
    </div>
    <div class="messages-container">
        ${messagesHtml || '<div class="empty-state">No messages yet. Run a command to see output here.</div>'}
    </div>
    <script>
        const vscode = acquireVsCodeApi();

        function clearMessages() {
            vscode.postMessage({ command: 'clear' });
        }
    </script>
</body>
</html>`;
    }

    private renderMessage(msg: Message): string {
        const time = msg.timestamp.toLocaleTimeString();
        const statusClass = msg.status;
        
        return \`<div class="message \${statusClass}">
            <div class="command">\${this.escapeHtml(msg.command)}</div>
            <div class="output \${statusClass}">\${this.escapeHtml(msg.output)}</div>
            <div class="timestamp">\${time}</div>
        </div>\`;
    }

    private escapeHtml(text: string): string {
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}
```

- [ ] **Step 2: Compile and verify no errors**

```bash
npm run compile
```

Expected: No errors, `out/messagePanel.js` created

- [ ] **Step 3: Commit**

```bash
git add src/messagePanel.ts
git commit -m "feat: add MessagePanelProvider for webview rendering"
```

---

## Task 3: Register message panel in package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the view to views section**

Find the `"views"` section (around line 62). Add the message panel view:

```json
"views": {
  "celebiViewContainer": [
    {
      "id": "celebiTreeView",
      "name": "Celebi",
      "icon": "media/icon.png"
    },
    {
      "id": "diteMessagePanel",
      "name": "DITE Messages",
      "icon": "media/icon.png"
    }
  ]
}
```

- [ ] **Step 2: Add the clearMessages command**

Find the `"commands"` array (around line 71). Add this command at the end:

```json
{
  "command": "celebi.clearMessages",
  "title": "Clear DITE Messages",
  "icon": "$(trash)"
}
```

- [ ] **Step 3: Verify JSON syntax**

```bash
npm run compile
```

Expected: No syntax errors

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: register diteMessagePanel view and clearMessages command"
```

---

## Task 4: Initialize message panel in extension.ts

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Import MessageStore and MessagePanelProvider**

At the top of `src/extension.ts` (after existing imports), add:

```typescript
import { MessageStore, MessagePanelProvider } from './messagePanel';
```

- [ ] **Step 2: Create message store instance in activate function**

After the line `const outputChannel = getOutputChannel();` (around line 9), add:

```typescript
    // Initialize message store for DITE panel
    const messageStore = new MessageStore();
    const messagePanelProvider = new MessagePanelProvider(messageStore);
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            MessagePanelProvider.viewType,
            messagePanelProvider
        )
    );
```

- [ ] **Step 3: Register clearMessages command**

Find where other commands are registered (around line 84). Add this before the `switchProject` command:

```typescript
    // Command to clear messages
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.clearMessages', () => {
            messageStore.clear();
            messagePanelProvider.updateWebview();
        })
    );
```

- [ ] **Step 4: Create a wrapper function to log commands**

After the `updateStatusBar` function (around line 37), add this helper:

```typescript
    // Helper to execute command and log to message panel
    async function executeAndLog(
        commandName: string,
        pythonExpr: string,
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
```

- [ ] **Step 5: Compile and verify**

```bash
npm run compile
```

Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/extension.ts
git commit -m "feat: initialize message store and register clearMessages command"
```

---

## Task 5: Wrap submit command to log messages

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Update the submit command handler**

Find the `celebi.submit` command (around line 126). Replace the entire command registration with:

```typescript
    // Command to submit a task
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.submit', async () => {
            const objectName = await vscode.window.showInputBox({
                prompt: 'Enter object name to submit (or leave empty for current)',
                placeHolder: 'e.g., FitTask'
            });
            if (objectName === undefined) { return; } // Cancelled

            const pythonExpr = objectName
                ? `shell.MANAGER.sub_object('${objectName}').submit()`
                : 'shell.submit()';

            const commandName = objectName ? `submit ${objectName}` : 'submit';

            try {
                const result = await executeAndLog(
                    commandName,
                    pythonExpr,
                    () => execPython(pythonExpr)
                );
                provider.refresh();
                vscode.window.showInformationMessage(`Task submitted: ${result}`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );
```

- [ ] **Step 2: Compile and verify**

```bash
npm run compile
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: log submit command to message panel"
```

---

## Task 6: Wrap impress command to log messages

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Update the impress command handler**

Find the `celebi.impress` command (around line 149). Replace the entire command registration with:

```typescript
    // Command to impress an object
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.impress', async () => {
            const objectName = await vscode.window.showInputBox({
                prompt: 'Enter object name to impress',
                placeHolder: 'e.g., Fit'
            });
            if (!objectName) { return; }

            const impression = await vscode.window.showInputBox({
                prompt: 'Enter impression name',
                placeHolder: 'e.g., v1.0'
            });

            const pythonExpr = impression
                ? `shell.MANAGER.sub_object('${objectName}').impress('${impression}')`
                : `shell.MANAGER.sub_object('${objectName}').impress()`;

            const commandName = impression ? `impress ${objectName} ${impression}` : `impress ${objectName}`;

            try {
                const result = await executeAndLog(
                    commandName,
                    pythonExpr,
                    () => execPython(pythonExpr)
                );
                vscode.window.showInformationMessage(`Impression created: ${result}`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );
```

- [ ] **Step 2: Compile and verify**

```bash
npm run compile
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: log impress command to message panel"
```

---

## Task 7: Wrap refreshDite command to log messages

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Update the refreshDite command handler**

Find the `celebi.refreshDite` command (around line 99). Replace the entire command registration with:

```typescript
    // Command to refresh DITE status
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.refreshDite', async () => {
            try {
                const result = await executeAndLog(
                    'refreshDite',
                    'shell.MANAGER.current_object().printed_dite_status()',
                    () => execPython('shell.MANAGER.current_object().printed_dite_status()')
                );
                provider.refresh();
            } catch (error) {
                // Even if there's an error, refresh the tree
                provider.refresh();
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi DITE: ${message}`);
            }
        })
    );
```

- [ ] **Step 2: Compile and verify**

```bash
npm run compile
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: log refreshDite command to message panel"
```

---

## Task 8: Wrap openObject command to log messages

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Update the openObject command handler**

Find the `celebi.openObject` command (around line 114). Replace the entire command registration with:

```typescript
    // Command to open an object
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.openObject', async (objectPath: string) => {
            try {
                const pythonExpr = `shell.MANAGER.sub_object('${objectPath}').status()`;
                await executeAndLog(
                    `open ${objectPath}`,
                    pythonExpr,
                    () => execPython(pythonExpr)
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );
```

- [ ] **Step 2: Compile and verify**

```bash
npm run compile
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: log openObject command to message panel"
```

---

## Task 9: Build and test in VS Code

**Files:**
- No new files

- [ ] **Step 1: Compile the extension**

```bash
npm run compile
```

Expected: No errors, all `.ts` files compiled to `out/`

- [ ] **Step 2: Open in debug mode**

Press `F5` to open a new VS Code window with the extension loaded

- [ ] **Step 3: Verify message panel appears**

In the Celebi sidebar, you should see a second panel labeled "DITE Messages" with "No messages yet" text

- [ ] **Step 4: Test submit command**

1. Right-click a task in the tree view
2. Select "Submit Task"
3. Enter a task name and confirm
4. Check that a message appears in the DITE Messages panel

- [ ] **Step 5: Test impress command**

1. Right-click a task in the tree view
2. Select "Impress Object"
3. Enter an object name and impression name
4. Check that a message appears in the panel

- [ ] **Step 6: Test clear button**

1. Click the "Clear" button in the DITE Messages panel
2. Verify all messages are removed

- [ ] **Step 7: Test error handling**

1. Try to submit with an invalid object name
2. Verify the error message appears in red in the panel

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: complete DITE message panel implementation with command logging"
```

---

## Summary

This implementation adds a persistent message panel to track all command executions and their results within the Celebi extension. Key features:

- **MessageStore**: In-memory storage of command-output pairs with timestamps
- **MessagePanelProvider**: WebviewViewProvider that renders messages with proper styling
- **Command Integration**: Submit, impress, refreshDite, and openObject commands now log their executions
- **Clear Functionality**: Users can clear message history via a button or command
- **Error Handling**: Both success and error messages are displayed with appropriate styling
- **Persistence**: Messages persist until manually cleared or a new session starts

The implementation follows VS Code extension patterns and integrates seamlessly with existing code.
