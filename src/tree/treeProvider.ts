import * as vscode from 'vscode';
import { CelebiTreeItem, CelebiObjectType } from '../treeItem';
import { execPython } from '../pythonRunner';
import { parseSubObjects, mapObjectType, SubObject } from './parser';
import { getObjectActions } from './objectActions';

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
            return await getObjectActions(element);
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
            const subObjects = parseSubObjects(result);

            return subObjects.map(obj => {
                const type = mapObjectType(obj.type);
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

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
