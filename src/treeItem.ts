import * as vscode from 'vscode';

export type CelebiObjectType = 'project' | 'algorithm' | 'task' | 'data' | 'directory' | 'action' | 'separator' | 'unknown' | 'view-group' | 'actions-group' | 'git-group' | 'info-group' | 'exec-group' | 'object-view-group';

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

        // Set icon based on object type
        this.iconPath = this.getIconForType(objectType);

        // Set context value for conditional commands
        this.contextValue = objectType;

        // Set tooltip
        this.tooltip = `${this.label} (${objectType})`;
    }

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
            case 'info-group':
                return new vscode.ThemeIcon('info', new vscode.ThemeColor('testing.iconSkipped'));
            case 'exec-group':
                return new vscode.ThemeIcon('zap', new vscode.ThemeColor('charts.blue'));
            case 'object-view-group':
                return new vscode.ThemeIcon('preview', new vscode.ThemeColor('icon.foreground'));
            default:
                return new vscode.ThemeIcon('file');
        }
    }
}
