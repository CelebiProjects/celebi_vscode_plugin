/**
 * Pure tree-building utilities, ported 1:1 from celebi_ui src/adapters/celebi-fs.js.
 *
 * buildObjectTree turns Celebi object records into a nested tree;
 * mergeFilesIntoTree attaches workspace files to matching object/directory
 * nodes by path-suffix matching.
 */

/** Celebi object types used for icon/colour selection. */
export type CelebiType = 'task' | 'algorithm' | 'data' | 'directory';

/** Structural node kind: plain directory, Celebi object, or workspace file. */
export type NodeKind = 'directory' | 'object' | 'file';

export interface TreeNode {
    id: string;
    name: string;
    type: NodeKind;
    icon: string;
    iconColor: string;
    celebiType: CelebiType | null;
    data: Record<string, unknown>;
    children: TreeNode[];
}

/** One record from the Python `sub_objects_recursively` scan. */
export interface ObjectRecord {
    path: string;
    type: string;
    [key: string]: unknown;
}

/** One record from the Python `os.walk` file scan. */
export interface FileRecord {
    name: string;
    size?: { raw?: number; human_readable?: string };
    lastModified?: string;
    absolutePath?: string;
}

function getCelebiTypeStyle(type: string): { icon: string; iconColor: string } {
    switch (type) {
        case 'task':
            return { icon: 'cog', iconColor: 'orange' };
        case 'algorithm':
            return { icon: 'calculator', iconColor: 'blue' };
        case 'data':
            return { icon: 'database', iconColor: 'green' };
        default:
            return { icon: 'folder', iconColor: 'yellow' };
    }
}

function sortNodes(node: TreeNode): void {
    node.children.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
    });
    for (const child of node.children) {
        if (child.type === 'directory' || child.children.length > 0) {
            sortNodes(child);
        }
    }
}

/** Build a tree from Celebi object records. */
export function buildObjectTree(objects: ObjectRecord[]): TreeNode {
    const root: TreeNode = {
        id: '__root__',
        name: '.',
        type: 'directory',
        icon: 'folder open',
        iconColor: 'yellow',
        celebiType: null,
        data: {},
        children: [],
    };

    if (!objects || !Array.isArray(objects)) return root;

    const sorted = [...objects].sort((a, b) => {
        const depthA = a.path.split('/').length;
        const depthB = b.path.split('/').length;
        return depthA - depthB;
    });

    for (const obj of sorted) {
        const parts = obj.path.split('/');
        let current = root;
        let pathSoFar = '';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
            const isLast = i === parts.length - 1;

            if (isLast) {
                const style = getCelebiTypeStyle(obj.type);
                current.children.push({
                    id: obj.path,
                    name: part,
                    type: 'object',
                    icon: style.icon,
                    iconColor: style.iconColor,
                    celebiType: (obj.type || null) as CelebiType | null,
                    data: obj,
                    children: [],
                });
            } else {
                let dir = current.children.find(
                    (c) => (c.type === 'directory' || c.type === 'object') && c.name === part
                );
                if (!dir) {
                    dir = {
                        id: pathSoFar,
                        name: part,
                        type: 'directory',
                        icon: 'folder',
                        iconColor: 'yellow',
                        celebiType: null,
                        data: {},
                        children: [],
                    };
                    current.children.push(dir);
                }
                current = dir;
            }
        }
    }

    sortNodes(root);
    return root;
}

/**
 * Merge workspace files into the object tree.
 * Files are placed under their matching object/directory by suffix-matching.
 */
export function mergeFilesIntoTree(root: TreeNode, files: FileRecord[]): void {
    if (!files || !Array.isArray(files)) return;

    const nodeMap = new Map<string, TreeNode>();
    walkMap(root);

    function walkMap(node: TreeNode): void {
        nodeMap.set(node.id, node);
        for (const child of node.children || []) walkMap(child);
    }

    for (const file of files) {
        if (file.name.startsWith('impression_data/')) continue;

        const parts = file.name.split('/');
        if (parts[parts.length - 1].startsWith('.')) continue;
        if (parts.some((p) => p.startsWith('dot_'))) continue;

        const dirParts = parts.slice(0, -1);
        let matchedNode: TreeNode | null = null;
        for (let i = 0; i < dirParts.length; i++) {
            const suffixPath = dirParts.slice(i).join('/');
            if (nodeMap.has(suffixPath)) {
                matchedNode = nodeMap.get(suffixPath)!;
                break;
            }
        }

        let current = matchedNode || root;
        let startIdx = 0;
        if (matchedNode) {
            const matchedParts = matchedNode.id === '__root__' ? [] : matchedNode.id.split('/');
            startIdx = matchedParts.length;
        }

        let pathSoFar = current.id === '__root__' ? '' : current.id;
        for (let i = startIdx; i < parts.length; i++) {
            const part = parts[i];
            pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
            const isLast = i === parts.length - 1;

            if (isLast) {
                const alreadyExists = current.children.some(
                    (c) => c.type === 'file' && c.name === part
                );
                if (!alreadyExists) {
                    current.children.push({
                        id: file.name,
                        name: part,
                        type: 'file',
                        icon: 'file outline',
                        iconColor: 'grey',
                        celebiType: null,
                        data: file as unknown as Record<string, unknown>,
                        children: [],
                    });
                }
            } else {
                let dir = current.children.find(
                    (c) => (c.type === 'directory' || c.type === 'object') && c.name === part
                );
                if (!dir) {
                    dir = {
                        id: pathSoFar,
                        name: part,
                        type: 'directory',
                        icon: 'folder',
                        iconColor: 'yellow',
                        celebiType: null,
                        data: {},
                        children: [],
                    };
                    current.children.push(dir);
                }
                current = dir;
            }
        }
    }

    sortNodes(root);
}

/** Find a tree node by its path/id (exact match only). */
export function findNodeByPath(node: TreeNode, targetPath: string): TreeNode | null {
    if (node.id === targetPath) return node;
    for (const child of node.children || []) {
        const found = findNodeByPath(child, targetPath);
        if (found) return found;
    }
    return null;
}

/** Find the parent of a node in the tree. */
export function findParent(node: TreeNode, targetId: string, parent: TreeNode | null = null): TreeNode | null {
    if (node.id === targetId) return parent;
    for (const child of node.children || []) {
        const found = findParent(child, targetId, node);
        if (found) return found;
    }
    return null;
}

/** Build a map of id -> celebiType from the tree. */
export function buildTypeMap(node: TreeNode, map: Record<string, string> = {}): Record<string, string> {
    if (node.celebiType) {
        map[node.id] = node.celebiType;
    }
    for (const child of node.children || []) {
        buildTypeMap(child, map);
    }
    return map;
}
