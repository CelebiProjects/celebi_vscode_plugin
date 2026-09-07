jest.mock('vscode', () => ({
    Uri: { file: (fsPath: string) => ({ fsPath }) },
    Range: class {},
    WorkspaceEdit: class {
        content = '';
        replace(_uri: unknown, _range: unknown, content: string) { this.content = content; }
    },
    workspace: { openTextDocument: jest.fn(), applyEdit: jest.fn() },
}), { virtual: true });

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectFileEditor } from '../webview/projectFileEditor';

let root: string;
let target: string;
let text: string;
let document: { uri: vscode.Uri; version: number; isClosed: boolean; getText(): string; positionAt(offset: number): number; save: jest.Mock };
const node = { id: 'task', name: 'task', kind: 'object' as const };
beforeEach(async () => {
    jest.clearAllMocks();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'celebi-readme-'));
    await fs.mkdir(path.join(root, 'task'));
    target = path.join(root, 'task', 'README.md');
    text = '# Original\n\n';
    await fs.writeFile(target, text);
    document = {
        uri: vscode.Uri.file(target), version: 1, isClosed: false,
        getText: () => text, positionAt: offset => offset,
        save: jest.fn(async () => { await fs.writeFile(target, text); return true; }),
    };
    jest.mocked(vscode.workspace.openTextDocument).mockResolvedValue(document as unknown as vscode.TextDocument);
    jest.mocked(vscode.workspace.applyEdit).mockImplementation(async change => {
        text = (change as unknown as { content: string }).content;
        document.version++;
        return true;
    });
});
afterEach(() => fs.rm(root, { recursive: true, force: true }));

test('opens without changing disk and saves exact Markdown through the editor document', async () => {
    const editor = new ProjectFileEditor(root, 'README.md');
    const edit = await editor.open(node);
    expect(edit.content).toBe('# Original\n\n');
    expect(await fs.readFile(target, 'utf8')).toBe(edit.content);
    const markdown = '# Changed\n\n  indentation\n';
    expect(await editor.save(node.id, edit.session, markdown)).toBe(markdown);
    expect(await fs.readFile(target, 'utf8')).toBe(markdown);
    await expect(editor.save(node.id, edit.session, 'stale')).rejects.toThrow('Reopen');
});

test('also edits a README.md selected as a file node', async () => {
    const editor = new ProjectFileEditor(root, 'README.md');
    const edit = await editor.open({ id: 'task/README.md', name: 'README.md', kind: 'file' });
    await editor.save('task/README.md', edit.session, '');
    expect(await fs.readFile(target, 'utf8')).toBe('');
});

test('rejects overwriting an external disk change or a newer document edit', async () => {
    const editor = new ProjectFileEditor(root, 'README.md');
    const edit = await editor.open(node);
    await fs.writeFile(target, 'external');
    await expect(editor.save(node.id, edit.session, 'draft')).rejects.toThrow('changed outside');
    expect(await fs.readFile(target, 'utf8')).toBe('external');
    const next = await editor.open(node);
    document.version++;
    await expect(editor.save(node.id, next.session, 'draft')).rejects.toThrow('changed outside');
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
});

test('binds saves to the opened node and rejects non-README paths and traversal', async () => {
    const editor = new ProjectFileEditor(root, 'README.md');
    const edit = await editor.open(node);
    await expect(editor.save('other', edit.session, 'draft')).rejects.toThrow('Reopen');
    await expect(editor.open({ ...node, id: '../outside' })).rejects.toThrow('Invalid');
    await expect(editor.open({ id: 'task/code.py', name: 'README.md', kind: 'file' })).rejects.toThrow('README.md');
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
});

test('rejects a README symlink outside the project', async () => {
    const nestedRoot = path.join(root, 'nested');
    await fs.mkdir(path.join(nestedRoot, 'task'), { recursive: true });
    await fs.symlink(target, path.join(nestedRoot, 'task', 'README.md'));
    await expect(new ProjectFileEditor(nestedRoot, 'README.md').open(node)).rejects.toThrow('inside this project');
});

test('keeps the session available after a failed disk save', async () => {
    const editor = new ProjectFileEditor(root, 'README.md');
    const edit = await editor.open(node);
    document.save.mockResolvedValueOnce(false);
    await expect(editor.save(node.id, edit.session, 'draft')).rejects.toThrow('Could not save');
    expect(await editor.save(node.id, edit.session, 'draft')).toBe('draft');
});
