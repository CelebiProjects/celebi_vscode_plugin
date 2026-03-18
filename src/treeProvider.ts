import * as vscode from 'vscode';
import { CelebiTreeItem, CelebiObjectType } from './treeItem';
import { execPython } from './pythonRunner';

interface SubObject {
    path: string;
    type: string;
    name: string;
}

export class CelebiTreeProvider implements vscode.TreeDataProvider<CelebiTreeItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<CelebiTreeItem | undefined | void> = new vscode.EventEmitter<CelebiTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<CelebiTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    getTreeItem(element: CelebiTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: CelebiTreeItem): Promise<CelebiTreeItem[]> {
        if (!element) {
            // Root level - show projects or current project info
            return this.getRootItems();
        }

        // Child level - get sub-objects of the selected item
        if (element.objectType === 'project' || element.objectType === 'directory') {
            return this.getSubObjects(element.objectPath);
        }

        // If expanding an object (task/algorithm/data), show available actions
        if (element.objectType === 'task' || element.objectType === 'algorithm' || element.objectType === 'data') {
            return await this.getObjectActions(element);
        }

        return [];
    }

    private async getRootItems(): Promise<CelebiTreeItem[]> {
        try {
            // Get DITE status first
            let diteStatus = 'Unknown';
            try {
                const diteResult = await execPython('shell.MANAGER.current_object().printed_dite_status()');
                // Parse result like ">>>> DITE: success: [connected]:"
                const match = diteResult.match(/DITE:\s*(\w+):\s*\[(\w+)\]/);
                if (match) {
                    diteStatus = `[${match[2]}]`;
                } else {
                    diteStatus = diteResult.replace(/.*DITE:/, '').trim() || 'Unknown';
                }
            } catch {
                diteStatus = 'Not connected';
            }

            // Create DITE status item at the top with refresh button
            const diteItem = new CelebiTreeItem(
                `DITE: ${diteStatus}`,
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Refresh DITE Status',
                    command: 'celebi.refreshDite',
                    tooltip: 'Refresh DITE connection status'
                }
            );
            diteItem.iconPath = diteStatus === '[connected]'
                ? new vscode.ThemeIcon('vm-active', new vscode.ThemeColor('testing.iconPassed'))
                : new vscode.ThemeIcon('vm-outline', new vscode.ThemeColor('testing.iconFailed'));

            // Get current project info
            const projectName = await execPython('shell.MANAGER.get_current_project()');
            const projectPath = await execPython('shell.MANAGER.current_object().path');

            // Create project item
            const projectItem = new CelebiTreeItem(
                projectName,
                'project',
                projectPath,
                vscode.TreeItemCollapsibleState.Expanded,
                {
                    title: 'Show Project Info',
                    command: 'celebi.showOutput',
                    tooltip: 'Show project output'
                }
            );

            // Create group items with inline buttons
            // View group - Status, Tree, LS, Jobs
            const viewGroup = new CelebiTreeItem(
                'View',
                'view-group',
                '',
                vscode.TreeItemCollapsibleState.None
            );
            viewGroup.iconPath = new vscode.ThemeIcon('preview', new vscode.ThemeColor('icon.foreground'));

            // Actions group - Submit, Impress, Switch, Execute
            const actionsGroup = new CelebiTreeItem(
                'Actions',
                'actions-group',
                '',
                vscode.TreeItemCollapsibleState.None
            );
            actionsGroup.iconPath = new vscode.ThemeIcon('zap', new vscode.ThemeColor('testing.iconQueued'));

            // Git group - Trace, Git Status, Git History
            const gitGroup = new CelebiTreeItem(
                'Git & Trace',
                'git-group',
                '',
                vscode.TreeItemCollapsibleState.None
            );
            gitGroup.iconPath = new vscode.ThemeIcon('git-branch', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));

            // Keep individual command items for the list below
            const submitItem = new CelebiTreeItem(
                '',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Submit',
                    command: 'celebi.submit',
                    tooltip: 'Submit'
                }
            );
            submitItem.iconPath = new vscode.ThemeIcon('run');

            const impressItem = new CelebiTreeItem(
                '',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Impress',
                    command: 'celebi.impress',
                    tooltip: 'Impress'
                }
            );
            impressItem.iconPath = new vscode.ThemeIcon('tag');

            const switchItem = new CelebiTreeItem(
                '',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Switch',
                    command: 'celebi.switchProject',
                    tooltip: 'Switch Project'
                }
            );
            switchItem.iconPath = new vscode.ThemeIcon('folder-opened');

            const executeItem = new CelebiTreeItem(
                '',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Execute',
                    command: 'celebi.execute',
                    tooltip: 'Execute Command'
                }
            );
            executeItem.iconPath = new vscode.ThemeIcon('terminal');

            // Add visualization and git items (icon-only)
            const traceItem = new CelebiTreeItem(
                '',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Trace',
                    command: 'celebi.showTrace',
                    tooltip: 'Trace'
                }
            );
            traceItem.iconPath = new vscode.ThemeIcon('graph');

            const gitStatusItem = new CelebiTreeItem(
                '',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Git',
                    command: 'celebi.gitStatus',
                    tooltip: 'Git Status'
                }
            );
            gitStatusItem.iconPath = new vscode.ThemeIcon('git-branch');

            const gitHistoryItem = new CelebiTreeItem(
                '',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'History',
                    command: 'celebi.gitHistory',
                    tooltip: 'Git History'
                }
            );
            gitHistoryItem.iconPath = new vscode.ThemeIcon('history');

            // Add a separator between commands and navigation
            const separatorItem = new CelebiTreeItem(
                '─────────────────',
                'separator',
                '',
                vscode.TreeItemCollapsibleState.None,
                undefined  // No command for separator
            );
            separatorItem.iconPath = new vscode.ThemeIcon('blank');

            return [
                diteItem,
                projectItem,
                separatorItem,
                viewGroup,
                actionsGroup,
                gitGroup
            ];
        } catch (error) {
            // No project or error - show message
            return [
                new CelebiTreeItem(
                    'No project found',
                    'unknown',
                    '',
                    vscode.TreeItemCollapsibleState.None
                )
            ];
        }
    }

    private async getSubObjects(parentPath: string): Promise<CelebiTreeItem[]> {
        try {
            // Get the project path to calculate relative path
            const projectPath = await execPython('shell.MANAGER.current_object().path');

            // Calculate relative path from project root
            let subObjectExpr: string;
            if (parentPath === projectPath) {
                // Root project
                subObjectExpr = '.';
            } else if (parentPath.startsWith(projectPath + '/')) {
                // Subdirectory - use relative path from project root
                subObjectExpr = parentPath.substring(projectPath.length + 1);
            } else {
                // Fallback to just the name
                subObjectExpr = parentPath.split('/').pop() || parentPath;
            }

            // Parse the sub-objects from the Python API
            // Get sub_objects of the specific object that was clicked, not current_object
            const result = await execPython(
                `[(obj.path, obj.object_type()) for obj in shell.MANAGER.sub_object('${subObjectExpr}').sub_objects()]`
            );

            // Parse the result which should be a list of tuples
            const subObjects = this.parseSubObjects(result);

            return subObjects.map(obj => {
                const type = this.mapObjectType(obj.type);
                const name = obj.path.split('/').pop() || obj.path;

                // Make all objects expandable to show their actions
                const collapsibleState = type === 'project' || type === 'directory' || type === 'task' || type === 'algorithm' || type === 'data'
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None;

                return new CelebiTreeItem(
                    name,
                    type,
                    obj.path,
                    collapsibleState,
                    {
                        title: `Show ${name}`,
                        command: 'celebi.runPythonPackage',
                        arguments: [`shell.MANAGER.sub_object('${name}').status()`],
                        tooltip: `Show status of ${name}`
                    }
                );
            });
        } catch (error) {
            return [];
        }
    }

    private parseSubObjects(result: string): SubObject[] {
        // Parse Python list of tuples format
        // e.g., "[('/path/Fit', 'algorithm'), ('/path/Gen', 'algorithm')]"
        const subObjects: SubObject[] = [];

        try {
            // Remove brackets and split by '), (' to get individual tuples
            const cleaned = result.trim().slice(1, -1); // Remove [ and ]
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

    private mapObjectType(type: string): CelebiObjectType {
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

    private async getObjectActions(object: CelebiTreeItem): Promise<CelebiTreeItem[]> {
        const groups: CelebiTreeItem[] = [];

        // Calculate relative path from project root for nested objects
        const projectPath = await execPython('shell.MANAGER.current_object().path');
        let objectName: string;
        if (object.objectPath === projectPath) {
            objectName = '.';
        } else if (object.objectPath.startsWith(projectPath + '/')) {
            objectName = object.objectPath.substring(projectPath.length + 1);
        } else {
            objectName = object.label;
        }

        // Info group - stores object info for context menu actions
        const infoGroup = new CelebiTreeItem(
            'Info',
            'info-group',
            object.objectPath,
            vscode.TreeItemCollapsibleState.None,
            {
                title: 'Status',
                command: 'celebi.runPythonPackage',
                arguments: [`shell.MANAGER.sub_object('${objectName}').status()`],
                tooltip: 'Status'
            }
        );
        infoGroup.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('testing.iconSkipped'));
        groups.push(infoGroup);

        // Execute/Actions group - stores object info
        // Determine primary command based on object type
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

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
