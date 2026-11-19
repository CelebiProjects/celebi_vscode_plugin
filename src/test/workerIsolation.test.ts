import { EventEmitter } from 'events';
import { PassThrough, Writable } from 'stream';

jest.mock('vscode', () => ({
    workspace: { getConfiguration: () => ({ get: (_key: string, fallback: string) => fallback }) },
}), { virtual: true });
jest.mock('child_process', () => ({ spawn: jest.fn() }));

import { spawn } from 'child_process';
import { disposeCelebiPythonWorkers, runCelebiPython } from '../celebiScript';

test('directory requests finish while a detail status check is still running', async () => {
    let detailFinished = false;
    (spawn as jest.Mock).mockImplementation(() => {
        const child = new EventEmitter() as any;
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        let busy = false;
        child.stdin = new Writable({ write(chunk, _encoding, done) {
            const request = JSON.parse(chunk.toString());
            if (!busy && request.mode === 'children') {
                child.stdout.write(JSON.stringify({ id: request.id, result: { entries: [] } }) + '\n');
            } else { busy = true; }
            done();
        } });
        child.kill = () => child.emit('exit', 0);
        return child;
    });
    const detail = runCelebiPython('detail', '/tmp', '/tmp/task')
        .then(() => { detailFinished = true; }, () => { detailFinished = true; });
    try {
        const tree = await runCelebiPython('children', '/tmp');
        expect(tree).toEqual({ entries: [] });
        expect(detailFinished).toBe(false);
        expect(spawn).toHaveBeenCalledTimes(2);
        await runCelebiPython('children', '/tmp', '/tmp/another');
        expect(spawn).toHaveBeenCalledTimes(2);
    } finally {
        disposeCelebiPythonWorkers();
        await detail;
    }
});
