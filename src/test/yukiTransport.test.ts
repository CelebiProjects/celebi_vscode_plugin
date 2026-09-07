import { fetchYuki } from '../yuki/transport';

test('uses VS Code global fetch so proxy and response streaming stay intact', async () => {
    const response = { status: 200, text: async () => 'ok', json: async () => ({}) };
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response as unknown as Response);
    const signal = new AbortController().signal;
    await expect(fetchYuki('http://127.0.0.1:3315/dite-status', { method: 'GET', signal })).resolves.toBe(response);
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:3315/dite-status', { method: 'GET', signal });
    fetch.mockRestore();
});
