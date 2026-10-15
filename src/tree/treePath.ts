import * as path from 'path';

/** Resolve a real tree node to an absolute path contained by the project. */
export function resolveTreeItemPath(projectRoot: string, nodeId: string): string | undefined {
    if (!nodeId || nodeId === '__dite_status__' || nodeId.startsWith('__error__')) return undefined;

    const root = path.resolve(projectRoot);
    const target = path.resolve(root, nodeId);
    const relative = path.relative(root, target);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        return undefined;
    }
    return target;
}

/** Resolve a real tree node to its project-relative filesystem path. */
export function resolveTreeItemRelativePath(projectRoot: string, nodeId: string): string | undefined {
    const target = resolveTreeItemPath(projectRoot, nodeId);
    return target ? path.relative(path.resolve(projectRoot), target) : undefined;
}
