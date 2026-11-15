// The store every layer reads from. First implementation: in memory, keyed by
// one key shared with requests (source, model, run, variables, place). Saved
// areas (M3) add a second, on-device implementation; the contract is
// extracted then.

export class MemoryStore<T> {
  private entries = new Map<string, { value: T; storedAt: number }>();
  constructor(private maxEntries = 64) {}

  get(key: string): T | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    // Keep recently used entries at the end.
    this.entries.delete(key);
    this.entries.set(key, e);
    return e.value;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  put(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { value, storedAt: Date.now() });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  list(): string[] {
    return [...this.entries.keys()];
  }
}

/** One key for a point series: shared by the store and the request. */
export function pointKey(source: string, model: string, run: Date, variables: readonly string[], lat: number, lon: number): string {
  return [source, model, run.toISOString(), [...variables].sort().join('+'), lat.toFixed(3), lon.toFixed(3)].join('|');
}
