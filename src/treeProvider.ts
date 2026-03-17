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
            return this.getObjectActions(element);
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

            // Add quick action items
            const statusItem = new CelebiTreeItem(
                'Status',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Status',
                    command: 'celebi.runPythonPackage',
                    arguments: ['shell.status()'],
                    tooltip: 'Show project status'
                }
            );
            statusItem.iconPath = new vscode.ThemeIcon('pulse');

            const treeItem = new CelebiTreeItem(
                'Tree View',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Tree',
                    command: 'celebi.runPythonPackage',
                    arguments: ['shell.tree()'],
                    tooltip: 'Show project tree'
                }
            );
            treeItem.iconPath = new vscode.ThemeIcon('list-tree');

            const jobsItem = new CelebiTreeItem(
                'Jobs',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Jobs',
                    command: 'celebi.runPythonPackage',
                    arguments: ['shell.jobs()'],
                    tooltip: 'Show jobs'
                }
            );
            jobsItem.iconPath = new vscode.ThemeIcon('server');

            // Add command buttons
            const submitItem = new CelebiTreeItem(
                'Submit...',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Submit',
                    command: 'celebi.submit',
                    tooltip: 'Submit a task'
                }
            );
            submitItem.iconPath = new vscode.ThemeIcon('run');

            const impressItem = new CelebiTreeItem(
                'Impress...',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Impress',
                    command: 'celebi.impress',
                    tooltip: 'Impress an object'
                }
            );
            impressItem.iconPath = new vscode.ThemeIcon('tag');

            const switchItem = new CelebiTreeItem(
                'Switch Project...',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Switch Project',
                    command: 'celebi.switchProject',
                    tooltip: 'Switch to another project'
                }
            );
            switchItem.iconPath = new vscode.ThemeIcon('folder-opened');

            const executeItem = new CelebiTreeItem(
                'Execute Command...',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Execute',
                    command: 'celebi.execute',
                    tooltip: 'Execute arbitrary shell command'
                }
            );
            executeItem.iconPath = new vscode.ThemeIcon('terminal');

            // Add visualization and git items
            const traceItem = new CelebiTreeItem(
                'Trace Visualization',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Trace',
                    command: 'celebi.showTrace',
                    tooltip: 'Show dependency trace visualization'
                }
            );
            traceItem.iconPath = new vscode.ThemeIcon('graph');

            const gitStatusItem = new CelebiTreeItem(
                'Git Status',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Git Status',
                    command: 'celebi.gitStatus',
                    tooltip: 'Show git/changes status'
                }
            );
            gitStatusItem.iconPath = new vscode.ThemeIcon('git-branch');

            const gitHistoryItem = new CelebiTreeItem(
                'Git History',
                'unknown',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Git History',
                    command: 'celebi.gitHistory',
                    tooltip: 'Show git history'
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
                statusItem,
                treeItem,
                jobsItem,
                submitItem,
                impressItem,
                switchItem,
                executeItem,
                traceItem,
                gitStatusItem,
                gitHistoryItem
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
            // Get the object name from the path
            const objectName = parentPath.split('/').pop() || parentPath;

            // For root project, use '.' which represents the current project
            // For subdirectories, use the directory name
            const isRootProject = objectName === (await execPython('shell.MANAGER.get_current_project()'));
            const subObjectExpr = isRootProject ? '.' : objectName;

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

    private getObjectActions(object: CelebiTreeItem): CelebiTreeItem[] {
        const actions: CelebiTreeItem[] = [];
        const objectName = object.label;

        // Common actions for all object types
        actions.push(
            new CelebiTreeItem(
                'Status',
                'action',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Status',
                    command: 'celebi.runPythonPackage',
                    arguments: [`shell.MANAGER.sub_object('${objectName}').status()`],
                    tooltip: `Show status of ${objectName}`
                }
            ),
            new CelebiTreeItem(
                'Changes',
                'action',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'Changes',
                    command: 'celebi.runPythonPackage',
                    arguments: [`shell.MANAGER.sub_object('${objectName}').changes()`],
                    tooltip: `Show changes for ${objectName}`
                }
            ),
            new CelebiTreeItem(
                'History',
                'action',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    title: 'History',
                    command: 'celebi.runPythonPackage',
                    arguments: [`shell.MANAGER.sub_object('${objectName}').history()`],
                    tooltip: `Show history of ${objectName}`
                }
            )
        );

        // Type-specific actions
        if (object.objectType === 'task') {
            actions.push(
                new CelebiTreeItem(
                    'Submit',
                    'action',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        title: 'Submit',
                        command: 'celebi.runPythonPackage',
                        arguments: [`shell.MANAGER.sub_object('${objectName}').submit()`],
                        tooltip: `Submit ${objectName}`
                    }
                ),
                new CelebiTreeItem(
                    'Job Status',
                    'action',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        title: 'Job Status',
                        command: 'celebi.runPythonPackage',
                        arguments: [`shell.MANAGER.sub_object('${objectName}').job_status()`],
                        tooltip: `Show job status of ${objectName}`
                    }
                ),
                new CelebiTreeItem(
                    'Resubmit',
                    'action',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        title: 'Resubmit',
                        command: 'celebi.runPythonPackage',
                        arguments: [`shell.MANAGER.sub_object('${objectName}').resubmit()`],
                        tooltip: `Resubmit ${objectName}`
                    }
                ),
                new CelebiTreeItem(
                    'View Results',
                    'action',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        title: 'View Results',
                        command: 'celebi.viewResults',
                        arguments: [objectName],
                        tooltip: `Browse and view output files of ${objectName}`
                    }
                )
            );
        }

        if (object.objectType === 'algorithm') {
            actions.push(
                new CelebiTreeItem(
                    'Impress',
                    'action',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        title: 'Impress',
                        command: 'celebi.runPythonPackage',
                        arguments: [`shell.MANAGER.sub_object('${objectName}').impress()`],
                        tooltip: `Impress ${objectName}`
                    }
                ),
                new CelebiTreeItem(
                    'Predecessors',
                    'action',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        title: 'Predecessors',
                        command: 'celebi.runPythonPackage',
                        arguments: [`shell.MANAGER.sub_object('${objectName}').show_predecessors()`],
                        tooltip: `Show predecessors of ${objectName}`
                    }
                ),
                new CelebiTreeItem(
                    'Successors',
                    'action',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        title: 'Successors',
                        command: 'celebi.runPythonPackage',
                        arguments: [`shell.MANAGER.sub_object('${objectName}').show_successors()`],
                        tooltip: `Show successors of ${objectName}`
                    }
                )
            );
        }

        if (object.objectType === 'data') {
            actions.push(
                new CelebiTreeItem(
                    'Cat',
                    'action',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        title: 'Cat',
                        command: 'celebi.runPythonPackage',
                        arguments: [`shell.MANAGER.sub_object('${objectName}').cat()`],
                        tooltip: `Cat ${objectName}`
                    }
                ),
                new CelebiTreeItem(
                    'Impress',
                    'action',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        title: 'Impress',
                        command: 'celebi.runPythonPackage',
                        arguments: [`shell.MANAGER.sub_object('${objectName}').impress()`],
                        tooltip: `Impress ${objectName}`
                    }
                )
            );
        }

        // Add icons for actions
        actions.forEach(action => {
            switch (action.label) {
                case 'Status':
                    action.iconPath = new vscode.ThemeIcon('pulse');
                    break;
                case 'Changes':
                    action.iconPath = new vscode.ThemeIcon('diff');
                    break;
                case 'History':
                    action.iconPath = new vscode.ThemeIcon('history');
                    break;
                case 'Submit':
                case 'Resubmit':
                    action.iconPath = new vscode.ThemeIcon('run');
                    break;
                case 'Job Status':
                    action.iconPath = new vscode.ThemeIcon('server');
                    break;
                case 'Impress':
                    action.iconPath = new vscode.ThemeIcon('tag');
                    break;
                case 'Predecessors':
                case 'Successors':
                    action.iconPath = new vscode.ThemeIcon('arrow-swap');
                    break;
                case 'Cat':
                    action.iconPath = new vscode.ThemeIcon('file-text');
                    break;
                case 'View Results':
                    action.iconPath = new vscode.ThemeIcon('output');
                    break;
            }
        });

        return actions;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
