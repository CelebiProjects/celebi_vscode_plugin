/** Lazy Celebi repository tree. Only expanded directories are loaded. */
import * as path from 'path';
import * as vscode from 'vscode';
import { CelebiTreeItem } from '../treeItem';
import { runCelebiPython, ChildrenData } from '../celebiScript';
import { TreeNode } from './treeBuilder';
import { timing, elapsed } from '../timing';

function toItem(node: TreeNode): CelebiTreeItem {
    const collapsible = node.type !== 'file' && node.id !== '__dite_status__' && !node.id.startsWith('__error__')
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;
    return new CelebiTreeItem(node, collapsible);
}

/** DITE connection state shown at the top of the tree. */
export type DiteStatus = 'connected' | 'unconnected';

export class CelebiTreeProvider implements vscode.TreeDataProvider<CelebiTreeItem> {
    private generation = 0;
    private children = new Map<string, Promise<CelebiTreeItem[]>>();
    private typeMap: Record<string, string> = {};
    private itemCache = new Map<string, CelebiTreeItem>();
    private diteStatus: DiteStatus | null = null;
    error: string | null = null;

    private _onDidChangeTreeData = new vscode.EventEmitter<CelebiTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly projectRoot: string) {}

    getTreeItem(element: CelebiTreeItem): vscode.TreeItem {
        timing('tree.getTreeItem', { node: element.nodeId, label: String(element.label), kind: element.kind });
        return element;
    }

    async getChildren(element?: CelebiTreeItem): Promise<CelebiTreeItem[]> {
        if (element && (element.kind === 'file' || element.nodeId === '__dite_status__' || element.nodeId.startsWith('__error__'))) return [];
        const started = performance.now();
        const id = element?.nodeId || '';
        timing('tree.getChildren.enter', { node: id || '.', element: element?.label || '(root)', cached_directories: this.children.size });
        let pending = this.children.get(id);
        timing('tree.children.start', { node: id || '.', cached_or_pending: !!pending, generation: this.generation });
        if (!pending) {
            pending = this.loadChildren(id, this.generation);
            this.children.set(id, pending);
        }
        const children = await pending;
        timing('tree.children.done', { node: id || '.', total_ms: elapsed(started), count: children.length });
        const dite = !element ? this.diteStatusItem() : null;
        return dite ? [dite, ...children] : children;
    }

    private async loadChildren(id: string, generation: number): Promise<CelebiTreeItem[]> {
        try {
            const data = await runCelebiPython('children', this.projectRoot,
                path.join(this.projectRoot, id)) as ChildrenData;
            if (generation !== this.generation) {
                timing('tree.response.stale', { node: id || '.', generation });
                return [];
            }
            if (!id) this.error = null;
            const buildStarted = performance.now();
            const items = data.entries.map(entry => {
                if (entry.type) this.typeMap[entry.path] = entry.type;
                return this.cachedItem({
                    id: entry.path, name: entry.name, type: entry.kind,
                    celebiType: entry.type, icon: '', iconColor: '',
                    data: { ...entry, name: entry.path }, children: [],
                });
            });
            items.sort((a, b) => Number(a.kind === 'file') - Number(b.kind === 'file')
                || a.node.name.localeCompare(b.node.name));
            const parent = this.itemCache.get(id);
            if (parent) parent.node.children = items.map(item => item.node);
            timing('tree.build.done', { node: id || '.', build_ms: elapsed(buildStarted), count: items.length });
            return items;
        } catch (err) {
            if (generation !== this.generation) return [];
            this.children.delete(id); // A later expansion can retry.
            const message = err instanceof Error ? err.message : String(err);
            timing('tree.children.error', { node: id || '.', message });
            if (!id) this.error = message;
            return [this.cachedItem({
                id: '__error__' + id, name: message, type: 'directory',
                icon: 'error', iconColor: 'red', celebiType: null, data: {}, children: [],
            })];
        }
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

    /** Invalidate loaded directories; VS Code requests only visible branches again. */
    async refresh(): Promise<void> {
        timing('tree.refresh', { generation: this.generation + 1, cached_directories: this.children.size });
        this.generation++;
        this.error = null;
        this.children.clear();
        this.itemCache.clear();
        this.typeMap = {};
        this._onDidChangeTreeData.fire();
    }

    /** Materialize ancestors when navigating to an unexpanded object. */
    async resolveItem(id: string): Promise<CelebiTreeItem | undefined> {
        const parts = id.split('/');
        if (parts.some(part => !part || part === '.' || part === '..')) return undefined;
        let parent: CelebiTreeItem | undefined;
        for (let i = 0; i < parts.length; i++) {
            const children = await this.getChildren(parent);
            parent = children.find(item => item.nodeId === parts.slice(0, i + 1).join('/'));
            if (!parent) return undefined;
        }
        return parent;
    }

    /** Cached tree item for a node id, if the tree has materialized it. */
    getItemById(id: string): CelebiTreeItem | undefined {
        return this.itemCache.get(id);
    }

    getParent(element: CelebiTreeItem): vscode.ProviderResult<CelebiTreeItem> {
        const parentId = element.nodeId.split('/').slice(0, -1).join('/');
        return this.itemCache.get(parentId);
    }

    getTypeMap(): Record<string, string> {
        return { ...this.typeMap };
    }

    getProjectRoot(): string {
        return this.projectRoot;
    }
}
