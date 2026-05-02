/**
 * Celebi dynamic tree data provider.
 *
 * Renders the project tree in the sidebar:
 *   - Root: DITE status, project name, and action group items
 *   - Children: sub-objects (dirs, tasks, algorithms, data) from the
 *     CelebiChrono Python API via execPython()
 *   - Object nodes: expand to reveal action groups (View, Execute/Actions)
 */
import * as vscode from 'vscode';
import { CelebiTreeItem } from '../treeItem';
import { execPython } from '../pythonRunner';
import { parseSubObjects, mapObjectType } from './parser';
import { getObjectActions } from './objectActions';

export class CelebiTreeProvider implements vscode.TreeDataProvider<CelebiTreeItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<CelebiTreeItem | undefined | void> = new vscode.EventEmitter<CelebiTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<CelebiTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    getTreeItem(element: CelebiTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: CelebiTreeItem): Promise<CelebiTreeItem[]> {
        if (!element) {
            return this.getRootItems();
        }

        // Directories and projects: show sub-object children
        if (element.objectType === 'project' || element.objectType === 'directory') {
            return this.getSubObjects(element.objectPath);
        }

        // Tasks, algorithms, data: show action groups
        if (element.objectType === 'task' || element.objectType === 'algorithm' || element.objectType === 'data') {
            return await getObjectActions(element);
        }

        return [];
    }

    // ---- Root items: DITE status, project, and top-level action groups ----

    private async getRootItems(): Promise<CelebiTreeItem[]> {
        try {
            let diteStatus = 'Unknown';
            try {
                const diteResult = await execPython('shell.MANAGER.current_object().printed_dite_status()');
                const match = diteResult.match(/DITE:\s*(\w+):\s*\[(\w+)\]/);
                if (match) {
                    diteStatus = `[${match[2]}]`;
                } else {
                    diteStatus = diteResult.replace(/.*DITE:/, '').trim() || 'Unknown';
                }
            } catch {
                diteStatus = 'Not connected';
            }

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

            const projectName = await execPython('shell.MANAGER.get_current_project()');
            const projectPath = await execPython('shell.MANAGER.current_object().path');

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

            // Action group headers (icon-only, command from package.json menus)
            const viewGroup = new CelebiTreeItem(
                'View', 'view-group', '', vscode.TreeItemCollapsibleState.None
            );
            viewGroup.iconPath = new vscode.ThemeIcon('preview', new vscode.ThemeColor('icon.foreground'));

            const actionsGroup = new CelebiTreeItem(
                'Actions', 'actions-group', '', vscode.TreeItemCollapsibleState.None
            );
            actionsGroup.iconPath = new vscode.ThemeIcon('zap', new vscode.ThemeColor('testing.iconQueued'));

            const gitGroup = new CelebiTreeItem(
                'Git & Trace', 'git-group', '', vscode.TreeItemCollapsibleState.None
            );
            gitGroup.iconPath = new vscode.ThemeIcon('git-branch', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));

            const separatorItem = new CelebiTreeItem(
                '─────────────────',
                'separator',
                '',
                vscode.TreeItemCollapsibleState.None,
                undefined
            );
            separatorItem.iconPath = new vscode.ThemeIcon('blank');

            return [diteItem, projectItem, separatorItem, viewGroup, actionsGroup, gitGroup];
        } catch {
            return [
                new CelebiTreeItem(
                    'No project found', 'unknown', '', vscode.TreeItemCollapsibleState.None
                )
            ];
        }
    }

    // ---- Sub-object children ----

    private async getSubObjects(parentPath: string): Promise<CelebiTreeItem[]> {
        try {
            const projectPath = await execPython('shell.MANAGER.current_object().path');

            // Compute a relative expression for the Python API
            let subObjectExpr: string;
            if (parentPath === projectPath) {
                subObjectExpr = '.';
            } else if (parentPath.startsWith(projectPath + '/')) {
                subObjectExpr = parentPath.substring(projectPath.length + 1);
            } else {
                subObjectExpr = parentPath.split('/').pop() || parentPath;
            }

            const result = await execPython(
                `[(obj.path, obj.object_type()) for obj in shell.MANAGER.sub_object('${subObjectExpr}').sub_objects()]`
            );

            const subObjects = parseSubObjects(result);

            return subObjects.map(obj => {
                const type = mapObjectType(obj.type);
                const name = obj.path.split('/').pop() || obj.path;

                const collapsibleState = type === 'project' || type === 'directory' || type === 'task' || type === 'algorithm' || type === 'data'
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None;

                return new CelebiTreeItem(
                    name,
                    type,
                    obj.path,
                    collapsibleState,
                    {
                        title: `Show README`,
                        command: 'celebi.showReadme',
                        arguments: [obj.path],
                        tooltip: `Show README of ${name}`
                    }
                );
            });
        } catch {
            return [];
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
