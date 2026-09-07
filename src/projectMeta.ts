/**
 * Project filesystem metadata, mirroring celebi_ui:
 *  - project_uuid from .celebi/config.json
 *  - DITE serverurl from .celebi/hosts.json
 *  - object config from .celebi/config.json + .celebi/config.local.json
 *  - workspace file previews (text / base64 image / pdf / unsupported)
 */
import * as fs from 'fs';
import * as path from 'path';

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp', 'webp'];
export const CODE_EXTENSIONS = [
    'c', 'cpp', 'h', 'hpp', 'py', 'yaml', 'yml', 'json', 'sh', 'bash',
    'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'html', 'xml', 'toml',
    'ini', 'cfg', 'conf', 'md', 'rst',
];
export const TEXT_EXTENSIONS = ['txt', 'log', 'csv'];

const MIME_BY_EXT: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    webp: 'image/webp',
};

export interface ProjectMeta {
    projectUuid: string;
    diteUrl: string;
}

/** Read project-level metadata (both files optional). */
export function readProjectMeta(projectRoot: string): ProjectMeta {
    let projectUuid = '';
    try {
        const raw = fs.readFileSync(path.join(projectRoot, '.celebi', 'config.json'), 'utf8');
        projectUuid = (JSON.parse(raw) as Record<string, unknown>).project_uuid as string || '';
    } catch {
        // optional — leave empty
    }

    let diteUrl = '';
    try {
        const raw = fs.readFileSync(path.join(projectRoot, '.celebi', 'hosts.json'), 'utf8');
        const serverurl = (JSON.parse(raw) as Record<string, unknown>).serverurl as string | undefined;
        if (serverurl) {
            diteUrl = /^https?:\/\//.test(serverurl) ? serverurl : `http://${serverurl}`;
        }
    } catch {
        // optional — keep existing URL
    }

    return { projectUuid, diteUrl };
}

export interface ObjectConfigResult {
    config: Record<string, unknown> | null;
    localConfig: Record<string, unknown> | null;
}

/** Read an object's .celebi/config.json and .celebi/config.local.json. */
export function readObjectConfig(nodePath: string): ObjectConfigResult {
    const configPath = path.join(nodePath, '.celebi', 'config.json');
    const localPath = path.join(nodePath, '.celebi', 'config.local.json');

    let config: Record<string, unknown> | null = null;
    let localConfig: Record<string, unknown> | null = null;

    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    } catch {
        // optional
    }
    try {
        localConfig = JSON.parse(fs.readFileSync(localPath, 'utf8')) as Record<string, unknown>;
    } catch {
        // optional
    }

    return { config, localConfig };
}

export type FilePreviewPayload =
    | { kind: 'text'; content: string }
    | { kind: 'image'; base64: string; mime: string }
    | { kind: 'pdf'; absolutePath: string }
    | { kind: 'root'; absolutePath: string }
    | { kind: 'unsupported'; ext: string };

/** Read a workspace file for the detail webview preview. */
export function readFileForPreview(absolutePath: string): FilePreviewPayload {
    const ext = path.extname(absolutePath).slice(1).toLowerCase();

    if (IMAGE_EXTENSIONS.includes(ext)) {
        return {
            kind: 'image',
            base64: fs.readFileSync(absolutePath).toString('base64'),
            mime: MIME_BY_EXT[ext] || 'application/octet-stream',
        };
    }
    if (ext === 'pdf') {
        return { kind: 'pdf', absolutePath };
    }
    if (ext === 'root') {
        return { kind: 'root', absolutePath };
    }
    if (CODE_EXTENSIONS.includes(ext) || TEXT_EXTENSIONS.includes(ext)) {
        return { kind: 'text', content: fs.readFileSync(absolutePath, 'utf8') };
    }
    return { kind: 'unsupported', ext };
}
