/** Console output appears in the extension host's Debug Console during F5. */
export function timing(event: string, fields: Record<string, unknown> = {}): void {
    console.log(`[Celebi timing] ${JSON.stringify({ at: new Date().toISOString(), event, ...fields })}`);
}

export function elapsed(start: number): number {
    return Math.round((performance.now() - start) * 10) / 10;
}
