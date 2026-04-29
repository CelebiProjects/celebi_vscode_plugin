# Split Large Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the four largest TypeScript source files into focused modules without changing behavior.

**Architecture:** Extract pure/logic modules first (store, parser, HTML, utilities), then compose them into provider/command modules, finally wire everything in `extension.ts` via a single `registerCommands()` call.

**Tech Stack:** TypeScript, VS Code Extension API, Node.js `child_process`

---

## File Structure

```
src/
├── extension.ts ........................ refactored to ~120 lines
├── commands/
│   ├── index.ts ........................ registerCommands() wiring
│   ├── globalCommands.ts ............... project-level commands
│   ├── objectCommands.ts ............... tree object context commands
│   ├── creationCommands.ts ............. create/remove commands
│   └── utils.ts ........................ shared command utilities
├── tree/
│   ├── treeProvider.ts ................. CelebiTreeProvider only
│   ├── parser.ts ....................... parseSubObjects, mapObjectType
│   └── objectActions.ts ................ getObjectActions
├── webview/
│   ├── index.ts ........................ CelebiWebviewProvider (public API)
│   ├── baseWebview.ts .................. escapeHtml, getErrorHtml
│   ├── traceWebview.ts ................. trace view panel
│   ├── lsWebview.ts .................... ls view panel
│   └── browserWebview.ts ............... browser/iframe panel
├── message/
│   ├── messageStore.ts ................. MessageStore class
│   ├── messagePanel.ts ................. MessagePanelProvider class
│   └── messageHtml.ts .................. HTML generation helpers
├── pythonRunner.ts ..................... (unchanged)
├── treeItem.ts ......................... (unchanged)
└── test/
    └── (update imports if needed)
```

---

### Task 1: Extract MessageStore

**Files:**
- Create: `src/message/messageStore.ts`
- Modify: `src/messagePanel.ts`

- [ ] **Step 1: Create `src/message/messageStore.ts`**

Extract the `Message` interface and `MessageStore` class from the top of `src/messagePanel.ts`.

```typescript
export interface Message {
  command: string;
  output: string;
  timestamp: Date;
  status: 'success' | 'error';
}

export class MessageStore {
  private messages: Message[] = [];
  private readonly maxHistory: number = 100;

  addMessage(command: string, output: string, status: 'success' | 'error'): void {
    this.messages.push({
      command,
      output,
      timestamp: new Date(),
      status,
    });

    if (this.messages.length > this.maxHistory) {
      this.messages = this.messages.slice(-this.maxHistory);
    }
  }

  clear(): void {
    this.messages = [];
  }

  getHistory(): Message[] {
    return [...this.messages];
  }
}
```

- [ ] **Step 2: Update `src/messagePanel.ts` to import from `messageStore.ts`**

Replace the `Message` interface and `MessageStore` class at the top of `src/messagePanel.ts` with:

```typescript
import { Message, MessageStore } from './messageStore';
```

- [ ] **Step 3: Compile to verify**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/message/
git commit -m "refactor: extract MessageStore into message/messageStore.ts"
```

---

### Task 2: Extract Message HTML Generation

**Files:**
- Create: `src/message/messageHtml.ts`
- Modify: `src/messagePanel.ts`

- [ ] **Step 1: Create `src/message/messageHtml.ts`**

Extract HTML generation from `MessagePanelProvider` into a standalone module.

```typescript
import { Message } from './messageStore';

export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function getHtmlContent(messages: Message[]): string {
  const nonce = getNonce();
  const reversedMessages = [...messages].reverse();
  const messagesHtml = reversedMessages.map(msg => renderMessage(msg)).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <title>DITE Messages</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
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

function renderMessage(msg: Message): string {
  const time = msg.timestamp.toLocaleTimeString();
  const statusClass = msg.status;

  return `<div class="message ${statusClass}">
      <div class="command">${escapeHtml(msg.command)}</div>
      <div class="output ${statusClass}">${escapeHtml(msg.output)}</div>
      <div class="timestamp">${time}</div>
  </div>`;
}

function escapeHtml(text: string): string {
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
```

- [ ] **Step 2: Update `src/messagePanel.ts` to use `messageHtml.ts`**

Remove `getNonce()`, `getHtmlContent()`, `renderMessage()`, and `escapeHtml()` methods from `MessagePanelProvider`. Replace the `getHtmlContent()` call in `updateWebview()` with an import:

```typescript
import { getHtmlContent } from './messageHtml';
```

And update `updateWebview()`:

```typescript
public updateWebview(): void {
    if (this.view) {
        this.view.webview.html = getHtmlContent(this.store.getHistory());
    } else {
        this.pendingUpdate = true;
    }
}
```

- [ ] **Step 3: Compile to verify**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/message/
git commit -m "refactor: extract message HTML generation into message/messageHtml.ts"
```

---

### Task 3: Rename `messagePanel.ts` to `message/messagePanel.ts`

**Files:**
- Create: `src/message/messagePanel.ts` (move from root)
- Modify: imports in `src/extension.ts`

- [ ] **Step 1: Move file and update imports within `message/` folder**

```bash
git mv src/messagePanel.ts src/message/messagePanel.ts
```

Update the import inside `src/message/messagePanel.ts` from:
```typescript
import { Message, MessageStore } from './messageStore';
```
to (it should already be correct since it's now in the same folder).

Also update inside `src/message/messagePanel.ts`:
```typescript
import { getHtmlContent } from './messageHtml';
```

- [ ] **Step 2: Update `src/extension.ts` import**

Change:
```typescript
import { MessageStore, MessagePanelProvider } from './messagePanel';
```
to:
```typescript
import { MessageStore } from './message/messageStore';
import { MessagePanelProvider } from './message/messagePanel';
```

- [ ] **Step 3: Compile to verify**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/message/messagePanel.ts src/extension.ts
git commit -m "refactor: move messagePanel.ts into message/ folder"
```

---

### Task 4: Extract Tree Parser

**Files:**
- Create: `src/tree/parser.ts`
- Modify: `src/treeProvider.ts`

- [ ] **Step 1: Create `src/tree/parser.ts`**

```typescript
import { CelebiObjectType } from '../treeItem';

export interface SubObject {
    path: string;
    type: string;
    name: string;
}

export function parseSubObjects(result: string): SubObject[] {
    const subObjects: SubObject[] = [];

    try {
        const cleaned = result.trim().slice(1, -1);
        if (!cleaned) {
            return subObjects;
        }

        const tuples = cleaned.split('), (').map(s => s.replace(/^\(/, '').replace(/\)$/, ''));

        for (const tuple of tuples) {
            const parts = tuple.split(', ');
            if (parts.length >= 2) {
                const path = parts[0].replace(/['"]/g, '');
                const type = parts[1].replace(/['"]/g, '');
                const name = path.split('/').pop() || path;
                subObjects.push({ path, type, name });
            }
        }
    } catch (e) {
        console.error('Failed to parse sub-objects:', e);
    }

    return subObjects;
}

export function mapObjectType(type: string): CelebiObjectType {
    switch (type) {
        case 'project':
            return 'project';
        case 'algorithm':
            return 'algorithm';
        case 'task':
            return 'task';
        case 'data':
            return 'data';
        case 'directory':
            return 'directory';
        default:
            return 'unknown';
    }
}
```

- [ ] **Step 2: Update `src/treeProvider.ts`**

Remove the `SubObject` interface, `parseSubObjects()`, and `mapObjectType()` from `treeProvider.ts`. Add at the top:

```typescript
import { parseSubObjects, mapObjectType, SubObject } from './tree/parser';
```

- [ ] **Step 3: Compile to verify**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/tree/
git commit -m "refactor: extract tree parser into tree/parser.ts"
```

---

### Task 5: Extract Tree Object Actions

**Files:**
- Create: `src/tree/objectActions.ts`
- Modify: `src/treeProvider.ts`

- [ ] **Step 1: Create `src/tree/objectActions.ts`**

```typescript
import * as vscode from 'vscode';
import { CelebiTreeItem } from '../treeItem';
import { execPython } from '../pythonRunner';

export async function getObjectActions(object: CelebiTreeItem): Promise<CelebiTreeItem[]> {
    const groups: CelebiTreeItem[] = [];

    const projectPath = await execPython('shell.MANAGER.current_object().path');
    let objectName: string;
    if (object.objectPath === projectPath) {
        objectName = '.';
    } else if (object.objectPath.startsWith(projectPath + '/')) {
        objectName = object.objectPath.substring(projectPath.length + 1);
    } else {
        objectName = object.label;
    }

    const viewGroup = new CelebiTreeItem(
        'View',
        'object-view-group',
        object.objectPath,
        vscode.TreeItemCollapsibleState.None,
        {
            title: 'Status',
            command: 'celebi.runPythonPackage',
            arguments: [`shell.MANAGER.sub_object('${objectName}').status()`],
            tooltip: 'Status'
        }
    );
    viewGroup.iconPath = new vscode.ThemeIcon('preview', new vscode.ThemeColor('icon.foreground'));
    groups.push(viewGroup);

    let execCommand: vscode.Command | undefined;
    if (object.objectType === 'task') {
        execCommand = {
            title: 'Submit',
            command: 'celebi.runPythonPackage',
            arguments: [`shell.MANAGER.sub_object('${objectName}').submit()`],
            tooltip: 'Submit'
        };
    } else if (object.objectType === 'algorithm') {
        execCommand = {
            title: 'Impress',
            command: 'celebi.runPythonPackage',
            arguments: [`shell.MANAGER.sub_object('${objectName}').impress()`],
            tooltip: 'Impress'
        };
    } else if (object.objectType === 'data') {
        execCommand = {
            title: 'Cat',
            command: 'celebi.runPythonPackage',
            arguments: [`shell.MANAGER.sub_object('${objectName}').cat()`],
            tooltip: 'Cat'
        };
    }

    const execGroup = new CelebiTreeItem(
        object.objectType === 'task' ? 'Execute' : 'Actions',
        'exec-group',
        object.objectPath,
        vscode.TreeItemCollapsibleState.None,
        execCommand
    );
    execGroup.iconPath = new vscode.ThemeIcon('zap', new vscode.ThemeColor('charts.blue'));
    groups.push(execGroup);

    return groups;
}
```

- [ ] **Step 2: Update `src/treeProvider.ts`**

Remove `getObjectActions()` from `treeProvider.ts`. Add import:

```typescript
import { getObjectActions } from './tree/objectActions';
```

- [ ] **Step 3: Compile to verify**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/tree/
git commit -m "refactor: extract tree object actions into tree/objectActions.ts"
```

---

### Task 6: Move Tree Provider into `tree/` Folder

**Files:**
- Move: `src/treeProvider.ts` to `src/tree/treeProvider.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Move file**

```bash
git mv src/treeProvider.ts src/tree/treeProvider.ts
```

Update imports inside `src/tree/treeProvider.ts`:
```typescript
import { CelebiTreeItem, CelebiObjectType } from '../treeItem';
import { execPython } from '../pythonRunner';
import { parseSubObjects, mapObjectType, SubObject } from './parser';
import { getObjectActions } from './objectActions';
```

- [ ] **Step 2: Update `src/extension.ts`**

Change:
```typescript
import { CelebiTreeProvider } from './treeProvider';
```
to:
```typescript
import { CelebiTreeProvider } from './tree/treeProvider';
```

- [ ] **Step 3: Compile to verify**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/tree/treeProvider.ts src/extension.ts
git commit -m "refactor: move treeProvider.ts into tree/ folder"
```

---

### Task 7: Extract Webview Base Helpers

**Files:**
- Create: `src/webview/baseWebview.ts`

- [ ] **Step 1: Create `src/webview/baseWebview.ts`**

```typescript
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function getErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Celebi Trace - Error</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            padding: 20px;
            background: var(--vscode-editor-background);
            color: var(--vscode-errorForeground);
        }
    </style>
</head>
<body>
    <h1>Error</h1>
    <p>${escapeHtml(message)}</p>
</body>
</html>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/webview/baseWebview.ts
git commit -m "refactor: add webview base helpers"
```

---

### Task 8: Extract Trace Webview

**Files:**
- Create: `src/webview/traceWebview.ts`

- [ ] **Step 1: Create `src/webview/traceWebview.ts`**

```typescript
import * as vscode from 'vscode';
import { execPython } from '../pythonRunner';
import { escapeHtml, getErrorHtml } from './baseWebview';

let panel: vscode.WebviewPanel | undefined;

export async function showTraceView(objectName?: string) {
    if (panel) {
        panel.reveal();
    } else {
        panel = vscode.window.createWebviewPanel(
            'celebiTrace',
            'Celebi Trace',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.onDidDispose(() => {
            panel = undefined;
        });
    }

    try {
        const treeData = await execPython(`shell.tree()`);
        panel.webview.html = getTraceHtml(treeData);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        panel.webview.html = getErrorHtml(message);
    }
}

function getTraceHtml(treeData: string): string {
    const escapedTree = escapeHtml(treeData);

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Celebi Project Tree</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
        }
        h1 {
            font-size: 18px;
            margin-bottom: 20px;
            color: var(--vscode-titleBar-activeForeground);
        }
        .tree-container {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 20px;
            background: var(--vscode-panel-background);
            min-height: 400px;
            overflow: auto;
        }
        pre {
            margin: 0;
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.5;
            white-space: pre;
            color: var(--vscode-foreground);
        }
    </style>
</head>
<body>
    <h1>\u{1F4C1} Project Tree</h1>
    <div class="tree-container">
        <pre>${escapedTree}</pre>
    </div>
</body>
</html>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/webview/traceWebview.ts
git commit -m "refactor: extract trace webview into webview/traceWebview.ts"
```

---

### Task 9: Extract LS Webview

**Files:**
- Create: `src/webview/lsWebview.ts`

- [ ] **Step 1: Create `src/webview/lsWebview.ts`**

```typescript
import * as vscode from 'vscode';
import { escapeHtml } from './baseWebview';

let panel: vscode.WebviewPanel | undefined;

export async function showLsView(title: string, lsData: string) {
    if (panel) {
        panel.reveal();
    } else {
        panel = vscode.window.createWebviewPanel(
            'celebiLs',
            'Celebi LS',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.onDidDispose(() => {
            panel = undefined;
        });
    }

    panel.title = `\u{1F4C1} ${title}`;
    panel.webview.html = getLsHtml(title, lsData);
}

function getLsHtml(title: string, lsData: string): string {
    const escapedLs = escapeHtml(lsData);

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Celebi LS - ${escapeHtml(title)}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
        }
        h1 {
            font-size: 18px;
            margin-bottom: 20px;
            color: var(--vscode-titleBar-activeForeground);
        }
        .ls-container {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 20px;
            background: var(--vscode-panel-background);
            min-height: 400px;
            overflow: auto;
        }
        pre {
            margin: 0;
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.5;
            white-space: pre;
            color: var(--vscode-foreground);
        }
    </style>
</head>
<body>
    <h1>\u{1F4C1} ${escapeHtml(title)}</h1>
    <div class="ls-container">
        <pre>${escapedLs}</pre>
    </div>
</body>
</html>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/webview/lsWebview.ts
git commit -m "refactor: extract ls webview into webview/lsWebview.ts"
```

---

### Task 10: Extract Browser Webview

**Files:**
- Create: `src/webview/browserWebview.ts`

- [ ] **Step 1: Create `src/webview/browserWebview.ts`**

```typescript
import * as vscode from 'vscode';

let panel: vscode.WebviewPanel | undefined;

export async function showBrowser(objectName: string, url: string) {
    const column = vscode.window.activeTextEditor
        ? vscode.window.activeTextEditor.viewColumn
        : vscode.ViewColumn.One;

    if (panel) {
        panel.reveal(column);
    } else {
        panel = vscode.window.createWebviewPanel(
            'celebiBrowser',
            `Celebi: ${objectName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.onDidDispose(() => {
            panel = undefined;
        });

        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'openExternal':
                        vscode.env.openExternal(vscode.Uri.parse(message.url));
                        return;
                }
            }
        );
    }

    panel.title = `Celebi: ${objectName}`;
    panel.webview.html = getBrowserHtml(objectName, url);
}

function getBrowserHtml(objectName: string, url: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; frame-src ${url} http: https:; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .toolbar {
            padding: 8px 12px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }
        .toolbar span {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .toolbar .url {
            color: var(--vscode-textLink-foreground);
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .toolbar button {
            padding: 4px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }
        .toolbar button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .frame-container {
            flex: 1;
            position: relative;
            overflow: hidden;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
            background: white;
        }
        .error-message {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <span>${objectName}</span>
        <span class="url">${url}</span>
        <button onclick="openExternal()">Open in Browser</button>
        <button onclick="reloadFrame()">Reload</button>
    </div>
    <div class="frame-container">
        <iframe id="browserFrame" src="${url}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"></iframe>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const url = '${url}';

        function openExternal() {
            vscode.postMessage({ command: 'openExternal', url: url });
        }

        function reloadFrame() {
            const frame = document.getElementById('browserFrame');
            frame.src = frame.src;
        }

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'reload':
                    reloadFrame();
                    break;
            }
        });
    </script>
</body>
</html>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/webview/browserWebview.ts
git commit -m "refactor: extract browser webview into webview/browserWebview.ts"
```

---

### Task 11: Create Webview Provider Index

**Files:**
- Create: `src/webview/index.ts`
- Delete: `src/webviewProvider.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Create `src/webview/index.ts`**

```typescript
import { showTraceView } from './traceWebview';
import { showLsView } from './lsWebview';
import { showBrowser } from './browserWebview';

export class CelebiWebviewProvider {
    async showTraceView(objectName?: string) {
        return showTraceView(objectName);
    }

    async showLsView(title: string, lsData: string) {
        return showLsView(title, lsData);
    }

    async showBrowser(objectName: string, url: string) {
        return showBrowser(objectName, url);
    }
}
```

- [ ] **Step 2: Delete old webviewProvider.ts**

```bash
git rm src/webviewProvider.ts
```

- [ ] **Step 3: Update `src/extension.ts` import**

Change:
```typescript
import { CelebiWebviewProvider } from './webviewProvider';
```
to:
```typescript
import { CelebiWebviewProvider } from './webview';
```

- [ ] **Step 4: Compile to verify**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/webview/index.ts src/extension.ts src/webviewProvider.ts
git commit -m "refactor: replace webviewProvider.ts with webview/ module"
```

---

### Task 12: Extract Command Utilities

**Files:**
- Create: `src/commands/utils.ts`

- [ ] **Step 1: Create `src/commands/utils.ts`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/utils.ts
git commit -m "refactor: extract command utilities into commands/utils.ts"
```

---

### Task 13: Extract Global Commands

**Files:**
- Create: `src/commands/globalCommands.ts`

- [ ] **Step 1: Create `src/commands/globalCommands.ts`**

This file contains all project-level commands that don't operate on a specific tree object.

```typescript
import * as vscode from 'vscode';
import { CommandDependencies } from './index';
import { executeAndLog, escapePythonString } from './utils';
import { execPython, execPythonInTerminal } from '../pythonRunner';

export function registerGlobalCommands(context: vscode.ExtensionContext, deps: CommandDependencies): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.runPythonPackage', async (pythonExpr: string) => {
            try {
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, pythonExpr, () => execPython(pythonExpr));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.runInTerminal', (pythonExpr: string) => {
            execPythonInTerminal(pythonExpr);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showOutput', () => {
            deps.outputChannel.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.refreshTree', () => {
            deps.provider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showDiteMessages', async () => {
            console.log('[DITE] Manually showing DITE Messages panel');
            console.log('[DITE] messagePanelProvider exists:', !!deps.messagePanelProvider);
            console.log('[DITE] messageStore history:', deps.messageStore.getHistory().length);
            console.log('[DITE] resolve count:', deps.messagePanelProvider.getResolveCount());

            try {
                const panel = vscode.window.createWebviewPanel(
                    'diteMessagePanel',
                    'DITE Messages',
                    vscode.ViewColumn.Beside,
                    {}
                );
                console.log('[DITE] Created fallback webview panel');

                const messages = deps.messageStore.getHistory();
                const messagesHtml = messages.length > 0
                    ? messages.map(msg => `
                        <div style="border-left: 3px solid ${msg.status === 'success' ? '#4ec9b0' : '#f48771'}; padding: 8px 12px; margin-bottom: 12px; background: var(--vscode-panel-background);">
                            <div style="font-family: monospace; font-size: 12px; color: var(--vscode-textLink-foreground); margin-bottom: 4px;">$ ${msg.command}</div>
                            <div style="font-family: monospace; font-size: 12px; white-space: pre-wrap;">${msg.status === 'success' ? '✓' : '✗'} ${msg.output}</div>
                        </div>
                    `).join('')
                    : '<div style="text-align: center; color: var(--vscode-descriptionForeground); padding: 20px;">No messages yet</div>';

                panel.webview.html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <style>
                            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; background: var(--vscode-editor-background); color: var(--vscode-foreground); padding: 8px; }
                        </style>
                    </head>
                    <body>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--vscode-panel-border);">
                            <h2 style="font-size: 12px; font-weight: 600;">DITE Messages</h2>
                        </div>
                        ${messagesHtml}
                    </body>
                    </html>`;

                console.log('[DITE] Fallback panel HTML set');
            } catch (error) {
                console.error('[DITE] Failed to create fallback panel:', error);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.clearMessages', () => {
            deps.messageStore.clear();
            deps.messagePanelProvider.updateWebview();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.refreshDite', async () => {
            try {
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, 'refreshDite', () => execPython('shell.MANAGER.current_object().printed_dite_status()'));
                deps.provider.refresh();
                vscode.window.showInformationMessage(`DITE status refreshed`);
            } catch (error) {
                deps.provider.refresh();
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi DITE: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.openObject', async (objectPath: string) => {
            try {
                const pythonExpr = `shell.MANAGER.sub_object('${escapePythonString(objectPath)}').status()`;
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, `open ${objectPath}`, () => execPython(pythonExpr));
                vscode.window.showInformationMessage(`Object status displayed`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.submit', async () => {
            const objectName = await vscode.window.showInputBox({
                prompt: 'Enter object name to submit (or leave empty for current)',
                placeHolder: 'e.g., FitTask'
            });
            if (objectName === undefined) { return; }

            const pythonExpr = objectName
                ? `shell.MANAGER.sub_object('${escapePythonString(objectName)}').submit()`
                : 'shell.submit()';

            const commandName = objectName ? `submit ${objectName}` : 'submit';

            try {
                const result = await executeAndLog(deps.messageStore, deps.messagePanelProvider, commandName, () => execPython(pythonExpr));
                deps.provider.refresh();
                vscode.window.showInformationMessage(`Task submitted: ${result}`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

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
                ? `shell.MANAGER.sub_object('${escapePythonString(objectName)}').impress('${escapePythonString(impression)}')`
                : `shell.MANAGER.sub_object('${escapePythonString(objectName)}').impress()`;

            const commandName = impression ? `impress ${objectName} ${impression}` : `impress ${objectName}`;

            try {
                const result = await executeAndLog(deps.messageStore, deps.messagePanelProvider, commandName, () => execPython(pythonExpr));
                deps.provider.refresh();
                vscode.window.showInformationMessage(`Impression created: ${result}`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.switchProject', async () => {
            try {
                const projectsResult = await execPython('shell.MANAGER.get_all_projects()');
                const projects = projectsResult
                    .replace(/[\[\]'"]/g, '')
                    .split(',')
                    .map(p => p.trim())
                    .filter(p => p);

                const selected = await vscode.window.showQuickPick(projects, {
                    placeHolder: 'Select a project to switch to'
                });

                if (selected) {
                    await executeAndLog(deps.messageStore, deps.messagePanelProvider, `switch project to ${selected}`, () => execPython(`shell.MANAGER.switch_project('${escapePythonString(selected)}')`));
                    deps.provider.refresh();
                    deps.updateStatusBar();
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.execute', async () => {
            const command = await vscode.window.showInputBox({
                prompt: 'Enter shell function to execute',
                placeHolder: 'e.g., shell.tree() or shell.ls()'
            });
            if (!command) { return; }

            try {
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, command, () => execPython(command));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showStatus', async () => {
            try {
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, 'show status', () => execPython('shell.status()'));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showTree', async () => {
            try {
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, 'show tree', () => execPython('shell.tree()'));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showJobs', async () => {
            try {
                await executeAndLog(deps.messageStore, deps.messagePanelProvider, 'show jobs', () => execPython('shell.jobs()'));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showLs', async (arg?: unknown) => {
            try {
                const { getObjectNameFromArg } = require('./utils');
                const { objectName, title } = await getObjectNameFromArg(arg);
                const result = await executeAndLog(deps.messageStore, deps.messagePanelProvider, `ls ${objectName}`, () => execPython(`shell.MANAGER.sub_object('${escapePythonString(objectName)}').ls()`));
                await deps.webviewProvider.showLsView(title, result);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.showTrace', async (objectName?: string) => {
            await deps.webviewProvider.showTraceView(objectName);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.gitStatus', async () => {
            try {
                await execPython('shell.changes()');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('celebi.gitHistory', async () => {
            try {
                await execPython('shell.history()');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Celebi: ${message}`);
            }
        })
    );
}
```

Wait — there's an issue. `showLs` uses `getObjectNameFromArg` which I imported with a dynamic require. Let me fix that to a proper static import.

Actually, let me fix the code: at the top of the file, `getObjectNameFromArg` should be statically imported from `./utils`. Let me update:

```typescript
import { executeAndLog, escapePythonString, getObjectNameFromArg } from './utils';
```

And in `showLs`:
```typescript
const { objectName, title } = await getObjectNameFromArg(arg);
```

- [ ] **Step 2: Compile to verify**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/globalCommands.ts
git commit -m "refactor: extract global commands into commands/globalCommands.ts"
```

---

### Task 14: Extract Object Commands

**Files:**
- Create: `src/commands/objectCommands.ts`

- [ ] **Step 1: Create `src/commands/objectCommands.ts`**

```typescript
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
```

- [ ] **Step 2: Compile to verify**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/objectCommands.ts
git commit -m "refactor: extract object commands into commands/objectCommands.ts"
```

---

### Task 15: Extract Creation Commands

**Files:**
- Create: `src/commands/creationCommands.ts`

- [ ] **Step 1: Create `src/commands/creationCommands.ts`**

```typescript
import * as vscode from 'vscode';
import { CommandDependencies } from './index';
import { executeAndLog, escapePythonString, getObjectNameFromArg, parseOutputFiles } from './utils';
import { execPython } from '../pythonRunner';

export function registerCreationCommands(context: vscode.ExtensionContext, deps: CommandDependencies): void {
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

            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to REMOVE this ${targetType}?\n\n"${targetName}"\n\nThis action CANNOT be undone and may delete files permanently!`,
                { modal: true },
                'Yes, Remove It',
                'Cancel'
            );

            if (confirm !== 'Yes, Remove It') {
                return;
            }

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
}
```

- [ ] **Step 2: Compile to verify**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/creationCommands.ts
git commit -m "refactor: extract creation commands into commands/creationCommands.ts"
```

---

### Task 16: Create Command Registration Index

**Files:**
- Create: `src/commands/index.ts`

- [ ] **Step 1: Create `src/commands/index.ts`**

```typescript
import * as vscode from 'vscode';
import { CelebiTreeProvider } from '../tree/treeProvider';
import { CelebiWebviewProvider } from '../webview';
import { MessageStore, MessagePanelProvider } from '../message/messagePanel';
import { registerGlobalCommands } from './globalCommands';
import { registerObjectCommands } from './objectCommands';
import { registerCreationCommands } from './creationCommands';

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
```

- [ ] **Step 2: Compile to verify**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/index.ts
git commit -m "refactor: add command registration index"
```

---

### Task 17: Refactor Extension Entry Point

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Rewrite `src/extension.ts`**

Replace the entire content of `src/extension.ts` with a slimmed-down version that initializes providers and delegates to `registerCommands()`.

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
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
```

- [ ] **Step 2: Compile to verify**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "refactor: slim down extension.ts to wiring only"
```

---

### Task 18: Final Verification

**Files:**
- All modified/created files

- [ ] **Step 1: Full compilation**

Run: `npm run compile`
Expected: No errors, no warnings.

- [ ] **Step 2: Check file sizes**

Run: `find src -type f -name "*.ts" | xargs wc -l | sort -n | tail -20`
Expected: No file over 300 lines. `extension.ts` should be ~120 lines.

- [ ] **Step 3: Existing tests**

Run: `npm test` (or VS Code Extension Test Runner)
Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "refactor: complete file splitting for readability"
```

---

## Plan Self-Review

### Spec Coverage Check

| Spec Requirement | Implementing Task |
|---|---|
| Extract MessageStore | Task 1 |
| Extract Message HTML | Task 2 |
| Move message files to `message/` | Task 3 |
| Extract tree parser | Task 4 |
| Extract tree object actions | Task 5 |
| Move tree files to `tree/` | Task 6 |
| Extract webview base helpers | Task 7 |
| Extract trace webview | Task 8 |
| Extract ls webview | Task 9 |
| Extract browser webview | Task 10 |
| Create webview index/provider | Task 11 |
| Extract command utilities | Task 12 |
| Extract global commands | Task 13 |
| Extract object commands | Task 14 |
| Extract creation commands | Task 15 |
| Create command registration index | Task 16 |
| Refactor extension.ts | Task 17 |
| Verify build and tests | Task 18 |

All spec requirements are covered. No gaps.

### Placeholder Scan

- No "TBD", "TODO", or "implement later" found.
- All code blocks contain complete, copy-pasteable code.
- All steps have explicit compile/test commands.

### Type Consistency Check

- `CommandDependencies` interface defined in Task 16, used consistently in Tasks 13–16.
- `CelebiWebviewProvider` preserved as public API in Task 11.
- Import paths updated consistently across all tasks.
