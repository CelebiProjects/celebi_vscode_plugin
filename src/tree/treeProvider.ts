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
    buildObjectTree, mergeFilesIntoTree, buildTypeMap, findParent,
    TreeNode, ObjectRecord, FileRecord,
} from './treeBuilder';

function toItem(node: TreeNode): CelebiTreeItem {
    const collapsible = node.children.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;
    return new CelebiTreeItem(node, collapsible);
}

/** DITE connection state shown at the top of the tree. */
export type DiteStatus = 'connected' | 'unconnected';

export class CelebiTreeProvider implements vscode.TreeDataProvider<CelebiTreeItem> {
    private root: TreeNode = buildObjectTree([]);
    private typeMap: Record<string, string> = {};
    private itemCache = new Map<string, CelebiTreeItem>();
    private diteStatus: DiteStatus | null = null;
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
                return [this.cachedItem(errorNode)];
            }
            const diteItem = this.diteStatusItem();
            const children = this.root.children.map((child) => this.cachedItem(child));
            return diteItem ? [diteItem, ...children] : children;
        }
        return element.node.children.map((child) => this.cachedItem(child));
    }

    /** Update the DITE status row at the top of the tree. */
    setDiteStatus(status: DiteStatus): void {
        if (this.diteStatus === status) return;
        this.diteStatus = status;
        this._onDidChangeTreeData.fire();
    }

    /** The DITE status row: computer icon, green when connected, red when not. */
    private diteStatusItem(): CelebiTreeItem | null {
        if (!this.diteStatus) return null;
        const id = '__dite_status__';
        let item = this.itemCache.get(id);
        if (!item) {
            const node: TreeNode = {
                id, name: 'DITE', type: 'directory',
                icon: 'vm', iconColor: '', celebiType: null, data: {}, children: [],
            };
            item = toItem(node);
            this.itemCache.set(id, item);
        }
        const connected = this.diteStatus === 'connected';
        item.label = connected ? 'DITE: connected' : 'DITE: unconnected';
        item.iconPath = new vscode.ThemeIcon(
            connected ? 'vm-active' : 'vm-outline',
            new vscode.ThemeColor(connected ? 'testing.iconPassed' : 'testing.iconFailed')
        );
        item.command = {
            title: 'Refresh DITE Status',
            command: 'celebi.refreshDite',
            tooltip: 'Refresh DITE connection status',
        };
        return item;
    }

    /** Create-or-reuse the item for a node — stable identity across getChildren calls. */
    private cachedItem(node: TreeNode): CelebiTreeItem {
        let item = this.itemCache.get(node.id);
        if (!item) {
            item = toItem(node);
            this.itemCache.set(node.id, item);
        }
        return item;
    }

    /** Re-run the Python script and rebuild the tree. */
    async refresh(): Promise<void> {
        this.error = null;
        this.itemCache.clear();
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

    /** Cached tree item for a node id, if the tree has materialized it. */
    getItemById(id: string): CelebiTreeItem | undefined {
        return this.itemCache.get(id);
    }

    getParent(element: CelebiTreeItem): vscode.ProviderResult<CelebiTreeItem> {
        const id = element.nodeId;
        if (id === '__root__' || id === '__error__') return undefined;
        const parent = findParent(this.root, id);
        // Top-level items report '__root__' as parent — not a materialized
        // element, so returning undefined is correct.
        return parent ? this.itemCache.get(parent.id) : undefined;
    }

    getTypeMap(): Record<string, string> {
        return { ...this.typeMap };
    }

    getProjectRoot(): string {
        return this.projectRoot;
    }
}
