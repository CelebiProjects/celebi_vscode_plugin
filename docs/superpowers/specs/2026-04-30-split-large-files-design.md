# Split Large Files for Readability

## Goal

Split the four largest TypeScript source files in the Celebi VS Code extension into smaller, focused modules. No behavior changes — pure code movement.

## Current State

| File | Lines | Problem |
|---|---|---|
| `src/extension.ts` | 923 | "God function" activate() with 20+ command registrations inline |
| `src/treeProvider.ts` | 414 | Mixes tree data logic, Python parsing, and UI action generation |
| `src/webviewProvider.ts` | 332 | Single class manages three unrelated webview types (trace, ls, browser) |
| `src/messagePanel.ts` | 292 | Contains data store, webview lifecycle, and HTML generation |

Smaller files (`treeItem.ts` at 59 lines, `pythonRunner.ts` at 205 lines) are within acceptable size and left unchanged.

## Proposed Structure

```
src/
├── extension.ts ........................ ~120 lines
│   └── activate() only: init providers, status bar, file watchers,
│       then delegate to command registration.
│
├── commands/
│   ├── index.ts ........................ ~80 lines
│   │   └── registerCommands(context, deps): wires all commands
│   ├── globalCommands.ts ............... ~160 lines
│   │   └── runPythonPackage, runInTerminal, showOutput, refreshTree,
│   │       showDiteMessages, clearMessages, refreshDite, openObject,
│   │       submit, impress, switchProject, execute, showStatus,
│   │       showTree, showJobs
│   ├── objectCommands.ts ............... ~180 lines
│   │   └── objectStatus, objectTree, objectJobs, objectChanges,
│   │       objectHistory, objectSubmit, objectJob, objectResubmit,
│   │       objectResults, objectImpress, objectPre, objectSuc, objectCat
│   ├── creationCommands.ts ............. ~100 lines
│   │   └── createTask, createAlgorithm, createDirectory, removeObject
│   └── utils.ts ........................ ~70 lines
│       └── executeAndLog(), getObjectNameFromArg(),
│           escapePythonString(), parseOutputFiles()
│
├── tree/
│   ├── treeProvider.ts ................. ~160 lines
│   │   └── CelebiTreeProvider class (getChildren, getTreeItem, refresh)
│   ├── parser.ts ....................... ~60 lines
│   │   └── parseSubObjects(), mapObjectType(), SubObject interface
│   └── objectActions.ts ................ ~70 lines
│       └── getObjectActions() and action group builders
│
├── webview/
│   ├── baseWebview.ts .................. ~40 lines
│   │   └── Shared helper: createPanel(), escapeHtml(), getErrorHtml()
│   ├── traceWebview.ts ................. ~50 lines
│   │   └── showTraceView() + getTraceHtml()
│   ├── lsWebview.ts .................... ~60 lines
│   │   └── showLsView() + getLsHtml()
│   └── browserWebview.ts ............... ~90 lines
│       └── showBrowser() + getBrowserHtml() + message handling
│
├── message/
│   ├── messageStore.ts ................. ~40 lines
│   │   └── MessageStore class + Message interface
│   ├── messagePanel.ts ................. ~90 lines
│   │   └── MessagePanelProvider class (webview lifecycle, updateWebview)
│   └── messageHtml.ts .................. ~90 lines
│       └── getHtmlContent(), renderMessage(), escapeHtml(), getNonce()
│
├── pythonRunner.ts ..................... (unchanged)
├── treeItem.ts ......................... (unchanged)
└── test/
    └── (update imports as needed)
```

## Module Interfaces

### Command Registration

```typescript
// commands/index.ts
export interface CommandDependencies {
    provider: CelebiTreeProvider;
    webviewProvider: CelebiWebviewProvider;
    messageStore: MessageStore;
    messagePanelProvider: MessagePanelProvider;
    outputChannel: vscode.OutputChannel;
    updateStatusBar: () => Promise<void>;
}

export function registerCommands(
    context: vscode.ExtensionContext,
    deps: CommandDependencies
): void;
```

### Webview Provider

```typescript
// webview/index.ts
export class CelebiWebviewProvider {
    async showTraceView(objectName?: string): Promise<void>;
    async showLsView(title: string, lsData: string): Promise<void>;
    async showBrowser(objectName: string, url: string): Promise<void>;
}
```

The internal implementation delegates to `traceWebview.ts`, `lsWebview.ts`, and `browserWebview.ts`.

## Data Flow

1. `extension.ts` creates all providers/stores
2. `extension.ts` calls `registerCommands(context, deps)` with all dependencies
3. Commands import shared utilities from `commands/utils.ts`
4. `commands/` depends on `tree/`, `webview/`, `message/` — never the reverse

## Error Handling

Unchanged. Each command catches errors, shows `vscode.window.showErrorMessage()`, and logs to the message panel via `executeAndLog()`.

## Testing

- `commands/utils.ts`, `messageStore.ts`, `messageHtml.ts`, `tree/parser.ts` are pure or have clear inputs/outputs → unit testable
- Command handlers still need VS Code integration tests (existing pattern)

## Migration Notes

- All existing exports remain available. No breaking changes.
- `package.json` entry point stays `out/extension.js`.
- Import paths within the project change; compiled output is unaffected.
