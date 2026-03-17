import * as vscode from 'vscode';

export type CelebiObjectType = 'project' | 'algorithm' | 'task' | 'data' | 'directory' | 'action' | 'separator' | 'unknown';

export class CelebiTreeItem extends vscode.TreeItem {
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
                return new vscode.ThemeIcon('symbol-method');
            case 'task':
                return new vscode.ThemeIcon('run');
            case 'data':
                return new vscode.ThemeIcon('database');
            case 'directory':
                return new vscode.ThemeIcon('folder');
            case 'action':
                return new vscode.ThemeIcon('zap');
            case 'separator':
                return new vscode.ThemeIcon('blank');
            default:
                return new vscode.ThemeIcon('file');
        }
    }
}
