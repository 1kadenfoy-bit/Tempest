// Tells the Notification Centre about a save running in the background
// (docs/plans/offline-save.md): "Download started" at once, a progress bar only
// if it takes a while, and a second notification when it finishes or fails.
// The lead wires this to the real SaveJob; it only needs the job's own calls.
import type { SaveJob } from '../../core/offline/save-request';
import { notify, updateNotification } from './store';

/** A save quicker than this shows no progress bar. */
const BAR_AFTER_MS = 1500;

export function trackSave(job: SaveJob, name: string, showSaved: () => void): void {
  const started = Date.now();
  notify({ id: job.id, kind: 'download', text: 'Download started', time: new Date() });
  const off = job.onProgress((p) => {
    if (Date.now() - started < BAR_AFTER_MS) return;
    updateNotification(job.id, { progress: p.done / p.total, text: `Download started · ${p.label}` });
  });
  job.done.then(() => {
    off();
    // The started notice stays, without a bar; a new one says it is finished.
    updateNotification(job.id, { progress: undefined, text: 'Download started' });
    notify({ id: `${job.id}-done`, kind: 'download', text: `Saved for offline: ${name}`, time: new Date(), action: { label: 'Show saved data', run: showSaved } });
  }).catch((err: unknown) => {
    off();
    updateNotification(job.id, { progress: undefined });
    notify({ id: `${job.id}-failed`, kind: 'info', text: `Download failed: ${err instanceof Error ? err.message : String(err)}`, time: new Date() });
  });
}
