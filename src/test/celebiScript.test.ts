import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolvePythonEnv } from '../celebiScript';

function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'celebi-test-'));
}

describe('resolvePythonEnv', () => {
    test('uses configured pythonPath first', () => {
        const env = resolvePythonEnv('/proj', { pythonPath: '/opt/python', virtualenvPath: '', packagePath: '' });
        expect(env.pythonPath).toBe('/opt/python');
    });

    test('resolves venv python when virtualenvPath configured', () => {
        // The venv's python file must exist on disk for the resolution to
        // use it (same guard as auto-detection); create a throwaway venv so
        // the expectation is machine-independent.
        const venvDir = makeTmpDir();
        fs.mkdirSync(path.join(venvDir, 'bin'), { recursive: true });
        fs.writeFileSync(path.join(venvDir, 'bin', 'python'), '');
        const env = resolvePythonEnv('/proj', { pythonPath: '', virtualenvPath: venvDir, packagePath: '' });
        expect(env.pythonPath).toBe(path.join(venvDir, 'bin', 'python'));
        fs.rmSync(venvDir, { recursive: true, force: true });
    });

    test('auto-detects .venv in project root', () => {
        const dir = makeTmpDir();
        fs.mkdirSync(path.join(dir, '.venv', 'bin'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.venv', 'bin', 'python'), '');
        const env = resolvePythonEnv(dir, { pythonPath: '', virtualenvPath: '', packagePath: '' });
        expect(env.pythonPath).toBe(path.join(dir, '.venv', 'bin', 'python'));
        expect(env.venvPath).toBe(path.join(dir, '.venv'));
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('falls back to python3', () => {
        const env = resolvePythonEnv('/nonexistent', { pythonPath: '', virtualenvPath: '', packagePath: '' });
        expect(env.pythonPath).toBe('python3');
        expect(env.venvPath).toBeUndefined();
    });

    test('passes packagePath through', () => {
        const env = resolvePythonEnv('/proj', { pythonPath: '', virtualenvPath: '', packagePath: '/Celebi' });
        expect(env.packagePath).toBe('/Celebi');
    });
});
