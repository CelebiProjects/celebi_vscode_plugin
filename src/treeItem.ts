/**
 * Celebi tree item — a single node in the sidebar activity tree.
 *
 * Each item has a label, an object type (which controls icon and
 * context menu behavior), an optional filesystem path, and an
 * optional VS Code command that fires on click.
 */
import * as vscode from 'vscode';

/** All recognised Celebi object types — used for icon selection and filtering. */
export type CelebiObjectType = 'project' | 'algorithm' | 'task' | 'data' | 'directory'
    | 'action' | 'separator' | 'unknown'
    | 'view-group' | 'actions-group' | 'git-group'
    | 'object-view-group' | 'object-exec-group' | 'object-info-group';

export class CelebiTreeItem extends vscode.TreeItem {
    children?: CelebiTreeItem[];

    constructor(
        public readonly label: string,
        public readonly objectType: CelebiObjectType,
        public readonly objectPath: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);

        this.iconPath = this.getIconForType(objectType);
        this.contextValue = objectType;
        this.tooltip = `${this.label} (${objectType})`;
    }

    /** Map object type to the appropriate VS Code theme icon. */
    private getIconForType(type: CelebiObjectType): vscode.ThemeIcon {
        switch (type) {
            case 'project':
                return new vscode.ThemeIcon('project');
            case 'algorithm':
                return new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('symbolIcon.methodForeground'));
            case 'task':
                return new vscode.ThemeIcon('run', new vscode.ThemeColor('charts.blue'));
            case 'data':
                return new vscode.ThemeIcon('database', new vscode.ThemeColor('symbolIcon.color'));
            case 'directory':
                return new vscode.ThemeIcon('folder');
            case 'action':
                return new vscode.ThemeIcon('zap', new vscode.ThemeColor('symbolIcon.color'));
            case 'separator':
                return new vscode.ThemeIcon('blank');
            case 'view-group':
                return new vscode.ThemeIcon('preview', new vscode.ThemeColor('icon.foreground'));
            case 'actions-group':
                return new vscode.ThemeIcon('zap', new vscode.ThemeColor('testing.iconQueued'));
            case 'git-group':
                return new vscode.ThemeIcon('git-branch', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
            case 'object-info-group':
                return new vscode.ThemeIcon('info', new vscode.ThemeColor('testing.iconSkipped'));
            case 'object-exec-group':
                return new vscode.ThemeIcon('zap', new vscode.ThemeColor('charts.blue'));
            case 'object-view-group':
                return new vscode.ThemeIcon('preview', new vscode.ThemeColor('icon.foreground'));
            default:
                return new vscode.ThemeIcon('file');
        }
    }
}
