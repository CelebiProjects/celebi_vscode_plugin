import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import type { NodeDetail } from './detailMessages';

interface EditSession {
    nodeId: string;
    target: string;
    realPath: string;
    diskText: string;
    document: vscode.TextDocument;
    version: number;
    saving: boolean;
}

/** Owns file targets and edit versions; the webview never supplies a write path. */
export class ProjectFileEditor {
    private sessions = new Map<string, EditSession>();
    constructor(private readonly projectRoot: string, private readonly fileName: 'README.md' | 'celebi.yaml') {}

    private async resolve(node: Pick<NodeDetail, 'id' | 'kind' | 'name'>): Promise<{ target: string; realPath: string }> {
        if (node.kind === 'file' && node.name !== this.fileName) throw new Error(`Select a ${this.fileName} file.`);
        const parts = node.id.split('/');
        if (node.kind === 'file' && parts[parts.length - 1] !== this.fileName) throw new Error(`Select a ${this.fileName} file.`);
        if (path.isAbsolute(node.id) || parts.some(p => !p || p === '.' || p === '..' || p.includes('\\'))) {
            throw new Error(`Invalid ${this.fileName} location.`);
        }
        const target = path.join(this.projectRoot, ...parts, ...(node.kind === 'file' ? [] : [this.fileName]));
        const [root, realPath] = await Promise.all([fs.realpath(this.projectRoot), fs.realpath(target)]);
        const relative = path.relative(root, realPath);
        if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
            throw new Error(`${this.fileName} must be inside this project.`);
        }
        return { target, realPath };
    }

    async read(node: Pick<NodeDetail, 'id' | 'kind' | 'name'>): Promise<string | null> {
        try {
            return await fs.readFile((await this.resolve(node)).target, 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
        }
    }

    async open(node: Pick<NodeDetail, 'id' | 'kind' | 'name'>): Promise<{ session: string; content: string }> {
        const { target, realPath } = await this.resolve(node);
        const diskText = await fs.readFile(target, 'utf8');
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
        const session = randomUUID();
        for (const [key, edit] of this.sessions) if (edit.nodeId === node.id) this.sessions.delete(key);
        this.sessions.set(session, { nodeId: node.id, target, realPath, diskText, document, version: document.version, saving: false });
        return { session, content: document.getText() };
    }

    async save(nodeId: string, session: string, content: string): Promise<string> {
        const edit = this.sessions.get(session);
        if (!edit || edit.nodeId !== nodeId) throw new Error(`Reopen the ${this.fileName} editor before saving.`);
        if (edit.saving) throw new Error(`${this.fileName} is already being saved.`);
        edit.saving = true;
        try {
            if (await fs.realpath(edit.target) !== edit.realPath || await fs.readFile(edit.target, 'utf8') !== edit.diskText
                || edit.document.isClosed || edit.document.version !== edit.version) {
                throw new Error(`${this.fileName} changed outside this preview. Copy your draft, then cancel and reopen Edit to merge the changes.`);
            }
            const change = new vscode.WorkspaceEdit();
            change.replace(edit.document.uri, new vscode.Range(edit.document.positionAt(0), edit.document.positionAt(edit.document.getText().length)), content);
            if (!await vscode.workspace.applyEdit(change)) throw new Error(`Could not apply ${this.fileName} changes.`);
            edit.version = edit.document.version;
            if (!await edit.document.save()) throw new Error(`Could not save ${this.fileName}. Your draft is still available.`);
            this.sessions.delete(session);
            return edit.document.getText();
        } finally {
            edit.saving = false;
        }
    }
}
