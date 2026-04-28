# DITE-Project Message Panel Design

**Date:** 2026-04-28  
**Feature:** Embedded webview panel to display commands and their outputs

## Overview

Add a secondary webview panel embedded within the Celebi view container that displays command-output pairs. This panel provides a persistent, scrollable history of all commands executed through the extension (submit, impress, execute, etc.) and their results.

## User Experience

### Display Format
Messages appear as command-output pairs:
```
$ submit FitTask
✓ Task submitted successfully

$ impress Fit v1.0
✓ Impression created
```

### Behavior
- **Persistence:** Messages persist until user clicks "Clear" button or closes the panel
- **New Commands:** Each new command execution appends to the history
- **Auto-scroll:** Panel automatically scrolls to show the latest message
- **Error Handling:** Failed commands show with red error styling
- **Clear Button:** One-click button to clear all message history

## Architecture

### Components

#### 1. MessageStore (`src/messagePanel.ts`)
In-memory store for command-output pairs.

**Interface:**
```typescript
interface Message {
  command: string;        // The command that was executed
  output: string;         // The result/output
  timestamp: Date;        // When it executed
  status: 'success' | 'error'; // Execution status
}

class MessageStore {
  messages: Message[] = [];
  
  addMessage(command: string, output: string, status: 'success' | 'error'): void
  clear(): void
  getHistory(): Message[]
}
```

#### 2. MessagePanelProvider (`src/messagePanel.ts`)
Webview provider that renders the message panel.

**Responsibilities:**
- Renders the HTML/CSS for the panel
- Updates webview when messages change
- Handles "Clear" button clicks

**Integration:**
- Registered as webview view "diteMessagePanel" in the Celebi container
- Shared `messageStore` instance passed from `extension.ts`

#### 3. HTML/CSS Template (`src/messagePanel.html`)
Simple HTML structure showing message pairs with styling.

**Features:**
- Two-column layout: command (left) | output (right)
- Monospace font for terminal feel
- Green checkmarks for success, red X for errors
- Scroll container with auto-scroll to bottom
- Clear button in header

### Integration Points

#### Commands to Log
All of these commands should capture and log their execution:
- `celebi.submit`
- `celebi.impress`
- `celebi.execute`
- `celebi.runPythonPackage`
- `celebi.openObject`
- `celebi.refreshDite`
- Any other command that produces user-visible output

#### Command Wrapping Strategy
Wrap existing command handlers to:
1. Capture the command string (e.g., "submit FitTask")
2. Execute the command
3. Log success/error and output to messageStore
4. Display result as normal to user

#### New Command
- `celebi.clearMessages` - Clears message history and updates panel

### Data Flow

```
User executes command
        ↓
Handler captures command string + parameters
        ↓
execPython() or execPythonInTerminal() runs
        ↓
Result captured (output or error)
        ↓
messageStore.addMessage(command, output, status)
        ↓
MessagePanelProvider notified of change
        ↓
Webview updates with new message pair
        ↓
Panel auto-scrolls to bottom
```

## Implementation Details

### File Changes

**New Files:**
- `src/messagePanel.ts` — MessageStore + MessagePanelProvider classes
- `src/messagePanel.html` — Webview HTML template

**Modified Files:**
- `src/extension.ts` — Initialize messageStore and panel provider, wrap commands
- `package.json` — Register new view and command

### MessageStore Implementation
- Simple array-based in-memory store
- No persistence to disk (clears on VS Code restart)
- Unbounded growth (no size limit, but acceptable for typical usage)

### Webview Styling
- VS Code theme colors (use CSS custom properties for light/dark mode)
- Monospace font (Consolas, Monaco, etc.)
- Success: green text with checkmark
- Error: red text with X icon
- Timestamps: optional, can show as `HH:MM:SS` format

### Error Handling
- If command fails, capture the error message
- Display as `✗ Error message` in red
- Panel continues to function even if a single command errors
- Clear button always available

## Success Criteria

1. ✓ Panel appears as secondary view in Celebi container
2. ✓ Command-output pairs display in the format shown
3. ✓ Messages persist until "Clear" button clicked
4. ✓ New commands automatically append to history
5. ✓ Panel auto-scrolls to show latest message
6. ✓ Error commands show with red styling
7. ✓ All major commands (submit, impress, execute, etc.) are logged
8. ✓ Clear button removes all messages

## Testing Strategy

- **Unit:** Test MessageStore methods (add, clear, get)
- **Integration:** Execute each command type and verify it appears in panel
- **UI:** Verify panel renders correctly with multiple messages
- **Error:** Execute failing command and verify error display
- **Manual:** Test scrolling, clearing, and persistence across commands

## Future Enhancements (Out of Scope)

- Persist messages to file
- Search/filter messages
- Message timestamps
- Export message history
- Message size limit with auto-scroll behavior
