/** Content edits do not change the tree; object metadata and structure do. */
export function affectsTree(relativePath: string, change: 'change' | 'structure'): boolean {
    const parts = relativePath.split('/');
    if (parts[0] === 'impression_data' || parts.some(part => part.startsWith('dot_'))) return false;
    const metadata = parts.indexOf('.celebi');
    if (metadata >= 0) {
        return metadata === parts.length - 1 ||
            (metadata === parts.length - 2 && ['config.json', 'config.local.json'].includes(parts[parts.length - 1]!));
    }
    if (parts.some(part => part.startsWith('.')) || relativePath.endsWith('~undo-tree~')) return false;
    return change === 'structure' || parts[parts.length - 1] === 'celebi.yaml';
}
