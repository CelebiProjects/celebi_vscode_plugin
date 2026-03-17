# Celebi VS Code Extension

A VS Code extension for interacting with the [CelebiChrono](https://github.com/celebi) project management and execution system.

## Features

- **Dynamic Project Tree**: Browse your Celebi project structure (Projects → Algorithms/Tasks/Data)
- **Command Execution**: Run shell commands with output displayed in VS Code
- **Task Submission**: Submit tasks directly from the tree view
- **Impression Management**: Create impressions with input dialogs
- **Project Switching**: Quick-switch between projects
- **Trace Visualization**: Visualize dependency DAG in a webview panel
- **Git Integration**: View changes and history
- **Status Bar**: Shows current project name
- **Auto-refresh**: Tree automatically refreshes when files change

## Requirements

- VS Code 1.85.0 or higher
- Python with CelebiChrono package installed
- (Optional) Virtual environment with CelebiChrono

## Configuration

This extension contributes the following settings:

* `celebi.pythonPath`: Path to Python interpreter (auto-detected from virtualenv if empty)
* `celebi.virtualenvPath`: Path to Python virtualenv directory (auto-detected if empty)
* `celebi.packagePath`: Optional path to CelebiChrono package
* `celebi.projectPath`: Optional default project path

### Virtual Environment Auto-Detection

The extension automatically detects virtual environments in the following order:
1. Configured `celebi.virtualenvPath` setting
2. Auto-detected from common paths (`.venv`, `venv`, `env`, `.env`, `virtualenv`)
3. System Python (fallback)

## Usage

1. Open a Celebi project in VS Code
2. Open the Celebi view in the Activity Bar
3. The extension will auto-detect your virtualenv and project structure
4. Use the tree view to:
   - View project status
   - Submit tasks
   - Create impressions
   - Switch projects
   - Execute arbitrary commands
   - View trace visualization

## Commands

| Command | Description |
|---------|-------------|
| `celebi.runPythonPackage` | Execute Python expression |
| `celebi.runInTerminal` | Execute in integrated terminal |
| `celebi.showOutput` | Show output channel |
| `celebi.refreshTree` | Refresh tree view |
| `celebi.submit` | Submit task |
| `celebi.impress` | Impress object |
| `celebi.switchProject` | Switch project |
| `celebi.execute` | Execute arbitrary shell function |
| `celebi.showTrace` | Show dependency trace |
| `celebi.gitStatus` | Show git status |
| `celebi.gitHistory` | Show git history |

## Release Notes

### 0.0.1

Initial release with:
- Dynamic tree view showing project structure
- Virtualenv auto-detection
- Command execution with output channel
- Task submission and impression creation
- Project switching
- Trace visualization
- Git integration
- Status bar and file watchers

## Development

- `npm run compile` - Compile TypeScript
- Press `F5` to launch Extension Development Host

## License

See LICENSE file for details.
