# Celebi VS Code Extension

A VS Code extension for browsing [CelebiChrono](https://github.com/celebi) projects and viewing task results.

## Features

- **Dynamic Project Tree**: Browse your Celebi project structure (Projects → Algorithms/Tasks/Data + workspace files)
- **Detail Webview**: Click any node to see its metadata, README, parameters, commands, predecessors/successors, and task results
- **Inline README Editing**: Use Edit, Save, and Cancel in the README section of the detail preview. Works for object READMEs and selected `README.md` files; drafts survive selection changes while the panel remains open.
- **Task Results**: Automatically fetch job status and output files (plots, data, logs) from the DITE server for submitted tasks
- **Collect Results**: Click **Collect** beside Results to collect plots and logs for the selected impression and refresh the results.
- **PDF Plots**: PDF results appear alongside image plots with a first-page preview. Click to enlarge, or follow the filename link to open the full PDF.
- **ROOT Viewer**: Open local or remote `.root` results with JSROOT; remote files use byte-range streaming instead of a full download
- **Impression Selector**: Switch between historical impressions of a task
- **Auto-refresh**: Tree automatically refreshes when project files change
- **Manual Refresh**: Refresh the tree from the view title action

## Requirements

- VS Code 1.85.0 or higher
- A Celebi project opened as the workspace folder
- CelebiChrono Python package installed in the active Python environment
- DITE server running (default: `http://127.0.0.1:3315`) for task results

## Configuration

This extension contributes the following settings:

* `celebi.pythonPath`: Path to Python interpreter (auto-detected from virtualenv if empty)
* `celebi.virtualenvPath`: Path to Python virtualenv directory (auto-detected if empty)
* `celebi.packagePath`: Optional path to CelebiChrono package
* `celebi.diteServerUrl`: DITE server URL used when the project has no `.celebi/hosts.json`

### Virtual Environment Auto-Detection

The extension automatically detects virtual environments in the following order:
1. Configured `celebi.virtualenvPath` setting
2. Auto-detected from common paths (`.venv`, `venv`, `env`, `.env`, `virtualenv`)
3. System Python (fallback)

## Usage

1. Open a Celebi project in VS Code
2. Open the **Celebi** view in the Activity Bar
3. The extension builds the project tree from CelebiChrono
4. Click a node to explore its details in the main editor area
5. Click a submitted task to see its job status and result files
6. Click a `.root` result to open the interactive ROOT hierarchy and plots. Remote viewing requires DITE's `/export` and `/remote-export` routes to honor HTTP `Range` requests (`206 Partial Content`).

## Commands

| Command | Description |
|---------|-------------|
| `celebi.refreshTree` | Refresh the Celebi tree view |

## Development

- `npm run compile` - Compile TypeScript
- `npm run test` - Run the test suite
- Press `F5` to launch the Extension Development Host

## Release Notes

See [CHANGELOG.md](./CHANGELOG.md).

## License

MIT
