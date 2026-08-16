/**
 * Celebi tree item — a node in the repository tree.
 *
 * Wraps a TreeNode (built by tree/treeBuilder.ts) with VS Code presentation
 * (icon, tooltip, context value). Icon mapping mirrors celebi_ui's
 * CELEBI_TYPE_STYLES (task orange / algorithm blue / data green).
 */
import * as vscode from 'vscode';
import { TreeNode } from './tree/treeBuilder';

/** Structural node kind of a tree item. */
export type CelebiNodeKind = 'object' | 'directory' | 'file';

/** Pure icon mapping so it can be unit-tested outside the VS Code host. */
export function iconFor(kind: CelebiNodeKind, celebiType: string | null): { id: string; color?: string } {
    if (kind === 'directory') {
        return { id: 'folder', color: 'charts.yellow' };
    }
    if (kind === 'file') {
        return { id: 'file', color: 'charts.foreground' };
    }
    switch (celebiType) {
        case 'task':
            return { id: 'gear', color: 'charts.orange' };
        case 'algorithm':
            return { id: 'symbol-operator', color: 'charts.blue' };
        case 'data':
            return { id: 'database', color: 'charts.green' };
        default:
            return { id: 'symbol-misc', color: 'charts.foreground' };
    }
}

export class CelebiTreeItem extends vscode.TreeItem {
    readonly node: TreeNode;

    constructor(node: TreeNode, collapsibleState: vscode.TreeItemCollapsibleState) {
        super(node.name, collapsibleState);
        this.node = node;
        const icon = iconFor(node.type, node.celebiType);
        this.iconPath = icon.color
            ? new vscode.ThemeIcon(icon.id, new vscode.ThemeColor(icon.color))
            : new vscode.ThemeIcon(icon.id);
        this.contextValue = node.type;
        this.tooltip = node.celebiType ? `${node.name} (${node.celebiType})` : node.name;
    }

    get kind(): CelebiNodeKind {
        return this.node.type;
    }

    get celebiType(): string | null {
        return this.node.celebiType;
    }

    /** Node id = relative object/file path within the project. */
    get nodeId(): string {
        return this.node.id;
    }
}
