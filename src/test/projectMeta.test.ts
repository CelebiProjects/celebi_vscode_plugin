import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    readProjectMeta, readObjectConfig, readFileForPreview,
} from '../projectMeta';

function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'celebi-meta-test-'));
}

describe('readProjectMeta', () => {
    test('reads project_uuid and hosts serverurl', () => {
        const dir = makeTmpDir();
        fs.mkdirSync(path.join(dir, '.celebi'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.celebi', 'config.json'), JSON.stringify({ project_uuid: 'uuid-123' }));
        fs.writeFileSync(path.join(dir, '.celebi', 'hosts.json'), JSON.stringify({ serverurl: '127.0.0.1:3315' }));
        expect(readProjectMeta(dir)).toEqual({ projectUuid: 'uuid-123', diteUrl: 'http://127.0.0.1:3315' });
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('keeps absolute http urls and tolerates missing files', () => {
        const dir = makeTmpDir();
        fs.mkdirSync(path.join(dir, '.celebi'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.celebi', 'hosts.json'), JSON.stringify({ serverurl: 'https://dite.example.com' }));
        expect(readProjectMeta(dir)).toEqual({ projectUuid: '', diteUrl: 'https://dite.example.com' });
        fs.rmSync(dir, { recursive: true, force: true });
        expect(readProjectMeta(makeTmpDir())).toEqual({ projectUuid: '', diteUrl: '' });
    });
});

describe('readObjectConfig', () => {
    test('reads config.json and config.local.json', () => {
        const dir = makeTmpDir();
        const celebiDir = path.join(dir, '.celebi');
        fs.mkdirSync(celebiDir, { recursive: true });
        fs.writeFileSync(path.join(celebiDir, 'config.json'), JSON.stringify({ impression: 'imp-1' }));
        fs.writeFileSync(path.join(celebiDir, 'config.local.json'), JSON.stringify({ local: true }));
        expect(readObjectConfig(dir)).toEqual({
            config: { impression: 'imp-1' },
            localConfig: { local: true },
        });
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('returns nulls when no config exists', () => {
        const dir = makeTmpDir();
        expect(readObjectConfig(dir)).toEqual({ config: null, localConfig: null });
        fs.rmSync(dir, { recursive: true, force: true });
    });
});

describe('readFileForPreview', () => {
    test('reads text files', () => {
        const dir = makeTmpDir();
        const f = path.join(dir, 'a.log');
        fs.writeFileSync(f, 'hello');
        expect(readFileForPreview(f)).toEqual({ kind: 'text', content: 'hello' });
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('encodes images as base64', () => {
        const dir = makeTmpDir();
        const f = path.join(dir, 'plot.png');
        fs.writeFileSync(f, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        const result = readFileForPreview(f);
        expect(result.kind).toBe('image');
        expect((result as { mime: string }).mime).toBe('image/png');
        expect((result as { base64: string }).base64).toBe('iVBORw==');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('marks PDF and ROOT files for their dedicated viewers', () => {
        const dir = makeTmpDir();
        const pdf = path.join(dir, 'a.pdf');
        const root = path.join(dir, 'b.root');
        fs.writeFileSync(pdf, '%PDF');
        fs.writeFileSync(root, 'root-data');
        expect(readFileForPreview(pdf)).toEqual({ kind: 'pdf', absolutePath: pdf });
        expect(readFileForPreview(root)).toEqual({ kind: 'root', absolutePath: root });
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
