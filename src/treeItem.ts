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

// ---- Legacy surface — kept only so the old modules (tree/parser.ts,
// tree/objectActions.ts) still compile; they are dead code after the
// treeProvider rewrite and get deleted by Task 9. Do not extend. ----

/**
 * Legacy object-type union used by tree/parser.ts (mapObjectType).
 * @deprecated Will be removed with parser.ts in Task 9.
 */
export type CelebiObjectType = 'project' | 'algorithm' | 'task' | 'data' | 'directory'
    | 'action' | 'separator' | 'unknown'
    | 'view-group' | 'actions-group' | 'git-group'
    | 'object-view-group' | 'object-exec-group' | 'object-info-group';

export class CelebiTreeItem extends vscode.TreeItem {
    readonly node: TreeNode;

    /**
     * Legacy constructor shape used by tree/objectActions.ts
     * (new CelebiTreeItem(label, objectType, objectPath, state, command)).
     * @deprecated Will be removed with objectActions.ts in Task 9.
     */
    constructor(
        label: string,
        objectType: string,
        objectPath: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        command?: vscode.Command
    );
    constructor(node: TreeNode, collapsibleState: vscode.TreeItemCollapsibleState);
    constructor(
        nodeOrLabel: TreeNode | string,
        collapsibleStateOrType: vscode.TreeItemCollapsibleState | string,
        objectPath = '',
        collapsibleState?: vscode.TreeItemCollapsibleState,
        command?: vscode.Command
    ) {
        super(
            typeof nodeOrLabel === 'string' ? nodeOrLabel : nodeOrLabel.name,
            typeof nodeOrLabel === 'string'
                ? collapsibleState
                : (collapsibleStateOrType as vscode.TreeItemCollapsibleState)
        );

        if (typeof nodeOrLabel === 'string') {
            // Legacy call shape: wrap the (label, objectType, objectPath)
            // args in a minimal TreeNode so the rest of this class works.
            this.objectType = collapsibleStateOrType as string;
            this.objectPath = objectPath;
            this.node = {
                id: objectPath,
                name: nodeOrLabel,
                type: 'object',
                icon: '',
                iconColor: '',
                celebiType: null,
                data: {},
                children: [],
            };
            this.command = command;
            this.contextValue = this.objectType;
            this.tooltip = `${nodeOrLabel} (${this.objectType})`;
        } else {
            this.node = nodeOrLabel;
            const icon = iconFor(nodeOrLabel.type, nodeOrLabel.celebiType);
            this.iconPath = icon.color
                ? new vscode.ThemeIcon(icon.id, new vscode.ThemeColor(icon.color))
                : new vscode.ThemeIcon(icon.id);
            this.contextValue = nodeOrLabel.type;
            this.tooltip = nodeOrLabel.celebiType ? `${nodeOrLabel.name} (${nodeOrLabel.celebiType})` : nodeOrLabel.name;
        }
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

    // ---- Legacy fields — same rationale as the legacy constructor. ----

    /** @deprecated Legacy field for old objectActions.ts; use node instead. */
    objectType: string = '';
    /** @deprecated Legacy field for old objectActions.ts; use node instead. */
    objectPath: string = '';
    /** Label as plain string (base TreeItem allows TreeItemLabel/undefined). */
    declare readonly label: string;
}
