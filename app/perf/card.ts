// The ?perf results card: one screen Kaden can screenshot, each of his
// targets (docs/wishes/performance.md) beside what this phone measured.
// "Copy" puts every number on the clipboard as text, to paste into the chat.
import './perf.css';
import type { StepResult, TourResult } from './tour';

const s = (ms: number | undefined | null) => (typeof ms === 'number' ? `${(ms / 1000).toFixed(1)} s` : '—');
const esc = (x: string) => x.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

interface Row { what: string; got: string; target: string; ok: boolean | null }

function frameRow(st: StepResult | undefined, what: string): Row {
  const f = st?.frames;
  if (!f) return { what, got: st?.error ? `failed: ${st.error}` : '—', target: '30 / 24 fps', ok: null };
  return { what, got: `${f.fps} fps · slowest 1% ${f.low1} · worst ${f.worstMs} ms`, target: '30 / 24 fps', ok: f.fps >= 30 && f.low1 >= 24 };
}

export function rows(r: TourResult): Row[] {
  const by = (n: string) => r.steps.find((x) => x.name === n);
  const open = by('Open')?.data as Record<string, number | undefined> | undefined;
  const out: Row[] = [];
  out.push({ what: 'Open: everything', got: s(open?.everything), target: 'under 7 s', ok: typeof open?.everything === 'number' ? open.everything < 7000 : false });
  out.push({ what: '· first map', got: s(open?.firstMap), target: '', ok: null });
  out.push({ what: '· first weather', got: s(open?.firstWeather), target: '', ok: null });
  out.push({ what: '· pin forecast', got: open?.pinForecastFailed ? 'failed' : s(open?.pinForecast), target: '', ok: null });
  out.push(frameRow(by('Pan'), 'Pan'));
  out.push(frameRow(by('Pinch'), 'Pinch'));
  out.push(frameRow(by('Tilt 3D'), 'Tilt 3D'));
  const drag = by('Drag time')?.data as { steps?: number; drawn?: number; catchUpMs?: number | null } | undefined;
  out.push({ what: 'Drag time', got: drag?.steps ? `${drag.drawn}/${drag.steps} steps drawn · catch-up ${s(drag.catchUpMs)}` : '—', target: 'every step', ok: drag?.steps ? drag.drawn === drag.steps : null });
  const play = by('Play')?.data as { steps?: number; drawn?: number; medianDelayMs?: number | null } | undefined;
  out.push({ what: 'Play', got: play?.steps ? `${play.drawn}/${play.steps} steps · ${s(play.medianDelayMs)} each` : '—', target: 'every step', ok: play?.steps ? play.drawn === play.steps : null });
  const sw = (by('Switch layers')?.data.switches ?? []) as { layer: string; readyMs: number | null; worstFrameMs: number }[];
  for (const x of sw) out.push({ what: `Layer: ${x.layer}`, got: `${x.readyMs === null ? 'none in 15 s' : s(x.readyMs)} · hitch ${x.worstFrameMs} ms`, target: 'under 1 s', ok: x.readyMs !== null && x.readyMs < 1000 });
  const taps = (by('Panels')?.data.taps ?? []) as { openMs: number | null; closeMs: number | null }[];
  const t = taps.flatMap((x) => [x.openMs, x.closeMs]).filter((x): x is number => typeof x === 'number');
  out.push({ what: 'Taps (slowest)', got: t.length ? `${Math.max(...t)} ms` : '—', target: '0.1–0.2 s', ok: t.length ? Math.max(...t) <= 200 : null });
  const idle = by('Idle')?.data as { mapDraws?: number; downloads?: number; frameRequests?: number } | undefined;
  out.push({ what: 'Idle', got: idle ? `${idle.mapDraws} draws · ${idle.frameRequests} frames · ${idle.downloads} downloads` : '—', target: 'nothing', ok: idle ? idle.mapDraws === 0 && idle.downloads === 0 && idle.frameRequests === 0 : null });
  out.push({ what: 'Memory', got: r.memoryMB === null ? 'not reported by this browser' : `${r.memoryMB} MB`, target: 'no reload', ok: null });
  return out;
}

/** Every number as short text, for pasting into the chat. */
export function asText(r: TourResult): string {
  return JSON.stringify(r);
}

export function showCard(r: TourResult): void {
  const card = document.createElement('div');
  card.className = 'perf-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Speed test results');
  const ua = r.userAgent.match(/(iPhone|iPad|Android[^;)]*|Pixel[^;)]*)/)?.[1] ?? 'this device';
  const browser = /CriOS|Chrome/.test(r.userAgent) ? 'Chrome' : /Safari/.test(r.userAgent) ? 'Safari' : 'browser';
  const head = `<div class="perf-title">Speed test</div>
    <div class="perf-sub">${esc(new Date(r.started).toLocaleString())} · ${esc(ua)} · ${browser}${r.standalone ? ' · installed app' : ''} · ${esc(r.screen)}</div>
    <div class="perf-sub">Layer ${esc(String(r.setup.layer))} · 3D ${r.setup.terrain3d ? 'on' : 'off'}${r.steps.find((x) => x.name === 'Tilt 3D')?.data.switchedOnForTest ? ' (on for the 3D step)' : ''}</div>`;
  const table = rows(r).map((x) => `<tr><td>${esc(x.what)}</td><td>${esc(x.got)}</td><td class="perf-mark">${x.ok === null ? '' : x.ok ? 'pass' : 'miss'}</td></tr>`).join('');
  card.innerHTML = `${head}<table class="perf-table"><tbody>${table}</tbody></table>
    <div class="perf-buttons"><button class="perf-copy">Copy numbers</button><button class="perf-again">Run again</button><button class="perf-close">Close</button></div>`;
  card.querySelector('.perf-copy')!.addEventListener('click', async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    try { await navigator.clipboard.writeText(asText(r)); b.textContent = 'Copied'; } catch { b.textContent = 'Copy failed'; }
  });
  card.querySelector('.perf-again')!.addEventListener('click', () => location.reload());
  card.querySelector('.perf-close')!.addEventListener('click', () => card.remove());
  document.body.append(card);
}
