import { CelebiObjectType } from '../treeItem';

export interface SubObject {
    path: string;
    type: string;
    name: string;
}

export function parseSubObjects(result: string): SubObject[] {
    const subObjects: SubObject[] = [];

    try {
        const cleaned = result.trim().slice(1, -1);
        if (!cleaned) {
            return subObjects;
        }

        const tuples = cleaned.split('), (').map(s => s.replace(/^\(/, '').replace(/\)$/, ''));

        for (const tuple of tuples) {
            const parts = tuple.split(', ');
            if (parts.length >= 2) {
                const path = parts[0].replace(/['"]/g, '');
                const type = parts[1].replace(/['"]/g, '');
                const name = path.split('/').pop() || path;
                subObjects.push({ path, type, name });
            }
        }
    } catch (e) {
        console.error('Failed to parse sub-objects:', e);
    }

    return subObjects;
}

export function mapObjectType(type: string): CelebiObjectType {
    switch (type) {
        case 'project':
            return 'project';
        case 'algorithm':
            return 'algorithm';
        case 'task':
            return 'task';
        case 'data':
            return 'data';
        case 'directory':
            return 'directory';
        default:
            return 'unknown';
    }
}
