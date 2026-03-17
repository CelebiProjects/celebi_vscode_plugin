# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Celebi**, a VS Code extension that provides a custom activity bar view for interacting with the `CelebiChrono` Python package. The extension displays a dynamic tree view showing the project structure and provides commands to execute Python expressions.

## Development Commands

### Building
- `npm run compile` - Compile TypeScript to JavaScript (output: `out/`)

### Testing
Tests use the VS Code Extension Test Runner. From the quickstart:
1. Run the "watch" task first: **Tasks: Run Task** → `npm: watch`
2. Open the Testing view and run tests, or use hotkey `Ctrl/Cmd + ; A`
3. Test files match pattern `**.test.ts` in `src/test/`

### Development Workflow
- Press `F5` to open a new window with the extension loaded for debugging
- Set breakpoints in `src/extension.ts`
- Find extension output in the debug console

## Architecture

### Extension Entry Point (`src/extension.ts`)
The `activate` function registers:
1. **TreeDataProvider** (`celebiTreeView`) - Dynamic tree showing project structure
2. **Commands** - Multiple commands for interacting with CelebiChrono
3. **Status Bar Item** - Shows current project name
4. **File Watchers** - Auto-refresh tree on project changes
5. **SCM Provider** - Placeholder for git integration

### Tree View Architecture
- **`CelebiTreeProvider`** (`src/treeProvider.ts`): Dynamic tree data provider that queries `shell.MANAGER` for project structure. Shows project → algorithms/tasks/data hierarchy.
- **`CelebiTreeItem`** (`src/treeItem.ts`): Tree item with type-specific icons (project, algorithm, task, data, directory).

### Python Integration (`src/pythonRunner.ts`)
The `execPython()` function:
1. Reads configuration (Python path, virtualenv path, package path)
2. Auto-detects virtualenvs (`.venv`, `venv`, `env`, etc.)
3. Constructs a Python script using semicolons for single-line execution
4. Executes via `child_process.exec` with proper environment
5. Outputs results to the Celebi output channel

**Note:** This extension requires the `CelebiChrono` Python package to be installed in the environment where the commands run.

### Webview Provider (`src/webviewProvider.ts`)
Provides HTML-based visualization for:
- Dependency DAG visualization (`celebi.showTrace`)

## Configuration

### Extension Settings (`contributes.configuration`)
- `celebi.pythonPath` - Path to Python interpreter (auto-detected from virtualenv if empty)
- `celebi.virtualenvPath` - Path to Python virtualenv (auto-detected if empty)
- `celebi.packagePath` - Optional path to CelebiChrono package
- `celebi.projectPath` - Optional default project path

### Available Commands
- `celebi.runPythonPackage` - Execute Python expression
- `celebi.runInTerminal` - Execute in integrated terminal
- `celebi.showOutput` - Show output channel
- `celebi.refreshTree` - Refresh tree view
- `celebi.openObject` - Open object status
- `celebi.submit` - Submit task with input dialog
- `celebi.impress` - Impress object with input dialog
- `celebi.switchProject` - Switch project via QuickPick
- `celebi.execute` - Execute arbitrary shell function
- `celebi.showTrace` - Show dependency trace visualization
- `celebi.gitStatus` - Show git/changes status
- `celebi.gitHistory` - Show git history

### Package Manifest (`package.json`)
- **Main**: `out/extension.js` (compiled from `src/extension.ts`)
- **Activation**: `*` (activates on all workspaces)
- **Views**: Contributes `celebiViewContainer` to activity bar with `celebiTreeView`
- **Menus**: View title actions and context menus for tree items

### TypeScript Configuration
- Target: ES2020
- Module: CommonJS
- Output: `out/`
- Excludes: `src/test/` from main compilation (tests compiled separately)

### ESLint
Uses `typescript-eslint` with rules for:
- Import naming conventions (camelCase, PascalCase)
- curly braces, eqeqeq, no-throw-literal, semicolons
