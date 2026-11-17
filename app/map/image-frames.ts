// Image frames on the map: pictures a provider draws (radar), one raster
// source and layer per time, shown one at a time. The layer behind it never
// knows the provider: it hands a tile address per time. Only the frame shown
// and the next few are kept loading; the rest wait hidden (keeping their
// tiles for this view), up to a few frames, so a loop plays without
// downloading again and a pan never reloads every frame.
import type { Map as MapLibreMap } from 'maplibre-gl';

interface Frame { id: string; time: number; used: number }

export class ImageFrames {
  private frames = new Map<number, Frame>();
  private key = '';
  private urlFor: ((t: Date) => string) | null = null;
  private shown: Frame | null = null;
  private wanted: number | null = null;
  private seq = 0;
  private stamp = 0;
  private coverageUrl: string | null = null;

  constructor(
    private map: MapLibreMap,
    private prefix: string,
    private opts: { opacity: number; beforeId?: string | undefined; keep: number; attribution: string; maxzoom: number },
  ) {}

  /** What is drawn (product): changing it drops every frame. */
  setSource(key: string, urlFor: (t: Date) => string): void {
    if (key === this.key) return;
    this.clear();
    this.key = key;
    this.urlFor = urlFor;
  }

  /** Below this layer (labels stay on top); set once the style has its layers. */
  setBefore(beforeId: string | undefined): void { this.opts.beforeId = beforeId; }

  /** Show the frame at t (null hides all), and load `ahead` hidden so the next steps are ready. */
  show(t: Date | null, ahead: Date[] = []): void {
    const mine = ++this.seq;
    if (!t || !this.urlFor) { this.hideAll(); this.wanted = null; return; }
    const want = this.ensure(t.getTime());
    this.wanted = want.time;
    const keep = new Set([want.time, ...ahead.map((a) => a.getTime())]);
    for (const a of ahead) this.ensure(a.getTime());
    for (const f of this.frames.values()) {
      const visible = keep.has(f.time) || f === this.shown;
      this.setVis(f, visible);
      if (f !== this.shown) this.setOpacity(f, 0);
    }
    this.trim(keep);
    // Swap once the new frame's tiles are in (or after a moment), so playing never flashes empty.
    const swap = () => {
      if (mine !== this.seq || !this.frames.has(want.time)) return;
      if (this.shown && this.shown !== want) { this.setOpacity(this.shown, 0); if (!keep.has(this.shown.time)) this.setVis(this.shown, false); }
      this.setOpacity(want, this.opts.opacity);
      this.shown = want;
    };
    if (this.loaded(want) || !this.shown) { swap(); return; }
    const started = performance.now();
    const check = () => {
      if (mine !== this.seq) { this.map.off('sourcedata', check); return; }
      if (this.loaded(want) || performance.now() - started > 1500) { this.map.off('sourcedata', check); swap(); }
    };
    this.map.on('sourcedata', check);
    window.setTimeout(check, 1600);
  }

  /** The time of the frame on screen, if any. */
  get shownTime(): Date | null { return this.shown ? new Date(this.shown.time) : null; }
  get wantedTime(): Date | null { return this.wanted === null ? null : new Date(this.wanted); }

  /** A still overlay (coverage), above the frames; null removes it. */
  setCoverage(url: string | null): void {
    if (url === this.coverageUrl) return;
    const id = `${this.prefix}-coverage`;
    if (this.map.getLayer(id)) this.map.removeLayer(id);
    if (this.map.getSource(id)) this.map.removeSource(id);
    this.coverageUrl = url;
    if (!url) return;
    this.map.addSource(id, { type: 'raster', tiles: [url], tileSize: 512, maxzoom: this.opts.maxzoom, attribution: this.opts.attribution });
    this.map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 } }, this.opts.beforeId);
  }

  clear(): void {
    for (const f of [...this.frames.values()]) this.remove(f);
    this.shown = null;
    this.wanted = null;
    this.seq++;
  }

  /** How many frames hold a source now (for tests and the frame-rate readout). */
  get count(): number { return this.frames.size; }

  private ensure(time: number): Frame {
    let f = this.frames.get(time);
    if (!f) {
      const id = `${this.prefix}-${time}`;
      f = { id, time, used: 0 };
      this.map.addSource(id, { type: 'raster', tiles: [this.urlFor!(new Date(time))], tileSize: 512, maxzoom: this.opts.maxzoom, attribution: this.opts.attribution });
      // Under the coverage veil when it exists, so out-of-range areas stay grey over the frames.
      const cov = `${this.prefix}-coverage`;
      this.map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 } }, this.map.getLayer(cov) ? cov : this.opts.beforeId);
      this.frames.set(time, f);
    }
    f.used = ++this.stamp;
    return f;
  }

  private loaded(f: Frame): boolean {
    try { return this.map.isSourceLoaded(f.id); } catch { return false; }
  }

  private setVis(f: Frame, on: boolean) {
    if (this.map.getLayer(f.id)) this.map.setLayoutProperty(f.id, 'visibility', on ? 'visible' : 'none');
  }
  private setOpacity(f: Frame, v: number) {
    if (this.map.getLayer(f.id)) this.map.setPaintProperty(f.id, 'raster-opacity', v);
  }
  private hideAll() {
    for (const f of this.frames.values()) { this.setOpacity(f, 0); this.setVis(f, false); }
    this.shown = null;
  }
  /** Drop the least recently used frames beyond `keep` (never the one shown or wanted now). */
  private trim(now: Set<number>) {
    const extra = [...this.frames.values()].filter((f) => !now.has(f.time) && f !== this.shown).sort((a, b) => a.used - b.used);
    while (this.frames.size > this.opts.keep && extra.length) this.remove(extra.shift()!);
  }
  private remove(f: Frame) {
    if (this.map.getLayer(f.id)) this.map.removeLayer(f.id);
    if (this.map.getSource(f.id)) this.map.removeSource(f.id);
    this.frames.delete(f.time);
    if (this.shown === f) this.shown = null;
  }
}
