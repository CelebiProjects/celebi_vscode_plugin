import { MessageStore, MessagePanelProvider } from '../messagePanel';

describe('MessageStore', () => {
    test('addMessage adds a message correctly', () => {
        const store = new MessageStore();
        store.addMessage('submit FitTask', '✓ Task submitted', 'success');
        const history = store.getHistory();

        expect(history.length).toBe(1);
        expect(history[0].command).toBe('submit FitTask');
        expect(history[0].output).toBe('✓ Task submitted');
        expect(history[0].status).toBe('success');
        expect(history[0].timestamp).toBeInstanceOf(Date);
    });

    test('clear removes all messages', () => {
        const store = new MessageStore();
        store.addMessage('submit FitTask', '✓ Task submitted', 'success');
        store.clear();
        const history = store.getHistory();

        expect(history.length).toBe(0);
    });

    test('getHistory returns a copy, not reference', () => {
        const store = new MessageStore();
        store.addMessage('submit FitTask', '✓ Task submitted', 'success');
        const history1 = store.getHistory();
        history1.pop();
        const history2 = store.getHistory();

        expect(history2.length).toBe(1);
    });
});

describe('MessagePanelProvider helpers', () => {
    test('escapeHtml escapes special characters', () => {
        const provider = new (MessagePanelProvider as any)(new MessageStore());
        const result = provider.escapeHtml('<script>alert("test") & \'test\'</script>');
        expect(result).toBe('&lt;script&gt;alert(&quot;test&quot;) &amp; &#039;test&#039;&lt;/script&gt;');
    });

    test('getNonce returns 32-character string', () => {
        const provider = new (MessagePanelProvider as any)(new MessageStore());
        const nonce1 = provider.getNonce();
        const nonce2 = provider.getNonce();

        expect(nonce1.length).toBe(32);
        expect(nonce2.length).toBe(32);
        expect(nonce1).not.toBe(nonce2); // Should be different each time
    });
});
