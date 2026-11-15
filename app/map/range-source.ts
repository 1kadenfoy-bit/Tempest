import type { RangeResponse, Source } from 'pmtiles';

/**
 * Reads byte ranges over HTTP. If the host ignores the Range header and sends
 * the whole file (some static hosts do), keeps that one copy and slices it, so
 * the map works on any host. `partial` records which happened.
 */
export class RangeOrWholeSource implements Source {
  partial: boolean | undefined;
  private whole: Promise<ArrayBuffer> | undefined;
  constructor(private url: string) {}
  getKey() { return this.url; }
  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    if (!this.whole) {
      const res = await fetch(this.url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` }, ...(signal ? { signal } : {}) });
      if (res.status === 206) {
        this.partial = true;
        return { data: await res.arrayBuffer() };
      }
      if (!res.ok) throw new Error(`${this.url}: ${res.status}`);
      this.partial = false;
      this.whole = res.arrayBuffer();
    }
    return { data: (await this.whole).slice(offset, offset + length) };
  }
}
