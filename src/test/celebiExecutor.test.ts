jest.mock('vscode', () => ({
    workspace: { getConfiguration: () => ({ get: (_key: string, fallback: string) => fallback }) },
}), { virtual: true });
jest.mock('child_process', () => ({ spawn: jest.fn() }));

import { spawn } from 'child_process';
import { PassThrough } from 'stream';
import { disposeCelebiPythonWorkers, runCelebiPython } from '../celebiScript';

afterEach(() => disposeCelebiPythonWorkers());

test('runs Celebi inside its project so cwd-based predecessor APIs resolve correctly', async () => {
    const execute = jest.mocked(spawn);
    execute.mockImplementation(() => {
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const stdin = { write: (line: string) => {
            const request = JSON.parse(line) as { id: number };
            stdout.write(JSON.stringify({ id: request.id, result: { entries: [] } }) + '\n');
            return true;
        } };
        const child = {
            stdin, stdout, stderr, on: () => child,
            kill: () => true,
        };
        return child as unknown as ReturnType<typeof spawn>;
    });
    expect(await runCelebiPython('children', '/nonexistent-project')).toEqual({ entries: [] });
    expect(await runCelebiPython('children', '/nonexistent-project', '/nonexistent-project/subdir')).toEqual({ entries: [] });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith('python3', expect.any(Array),
        expect.objectContaining({ cwd: '/nonexistent-project' }));
});
