/**
 * Celebi repository tree data provider.
 *
 * On refresh, runs the one-shot Celebi Python script (objects + workspace
 * files), builds the full tree with treeBuilder.ts, and fires the change
 * event. Children are precomputed — no lazy expansion.
 */
import * as vscode from 'vscode';
import { CelebiTreeItem } from '../treeItem';
import { runCelebiPython, ProjectData } from '../celebiScript';
import {
    buildObjectTree, mergeFilesIntoTree, buildTypeMap, findNodeByPath,
    TreeNode, ObjectRecord, FileRecord,
} from './treeBuilder';

function toItem(node: TreeNode): CelebiTreeItem {
    const collapsible = node.children.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;
    return new CelebiTreeItem(node, collapsible);
}

export class CelebiTreeProvider implements vscode.TreeDataProvider<CelebiTreeItem> {
    private root: TreeNode = buildObjectTree([]);
    private typeMap: Record<string, string> = {};
    error: string | null = null;

    private _onDidChangeTreeData = new vscode.EventEmitter<CelebiTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly projectRoot: string) {}

    getTreeItem(element: CelebiTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: CelebiTreeItem): Promise<CelebiTreeItem[]> {
        if (!element) {
            if (this.error) {
                const errorNode: TreeNode = {
                    id: '__error__', name: this.error, type: 'directory',
                    icon: 'error', iconColor: 'red', celebiType: null, data: {}, children: [],
                };
                return [toItem(errorNode)];
            }
            return this.root.children.map(toItem);
        }
        return element.node.children.map(toItem);
    }

    /** Re-run the Python script and rebuild the tree. */
    async refresh(): Promise<void> {
        this.error = null;
        try {
            const data = (await runCelebiPython('project', this.projectRoot)) as ProjectData;
            this.root = buildObjectTree(data.objects as ObjectRecord[]);
            mergeFilesIntoTree(this.root, data.files as FileRecord[]);
            this.typeMap = buildTypeMap(this.root);
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
            this.root = buildObjectTree([]);
            this.typeMap = {};
        }
        this._onDidChangeTreeData.fire();
    }

    getTypeMap(): Record<string, string> {
        return { ...this.typeMap };
    }

    getNodeById(id: string): TreeNode | undefined {
        return findNodeByPath(this.root, id) ?? undefined;
    }

    getProjectRoot(): string {
        return this.projectRoot;
    }
}
