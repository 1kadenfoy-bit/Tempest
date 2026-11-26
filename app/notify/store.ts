// The app's own notifications (not weather alerts): one list the Notification
// Centre shows, newest first. No DOM in here, so it runs in unit tests.
// The calls are the ones in docs/plans/offline-save.md.

export type NotificationKind = 'download' | 'info';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  text: string;
  /** 0 to 1 while something is still running; left out when there is no progress to show. */
  progress?: number | undefined;
  time: Date;
  /** An optional button on the row, e.g. "Show saved data". */
  action?: { label: string; run: () => void } | undefined;
  read: boolean;
}

/** What a caller gives: the plan's shape, plus an optional button. */
export type NewNotification = Omit<AppNotification, 'read'>;

type Listener = () => void;

const items: AppNotification[] = [];
const listeners = new Set<Listener>();
const emit = () => { for (const fn of [...listeners]) fn(); };

/** Add a notification (or replace one with the same id). It starts unread. */
export function notify(n: NewNotification): void {
  const at = items.findIndex((x) => x.id === n.id);
  const next: AppNotification = { ...n, read: false };
  if (at >= 0) items[at] = next; else items.push(next);
  emit();
}

/** Change a notification: its text, progress, button. Progress changes alone do not make it unread again. */
export function updateNotification(id: string, patch: Partial<Omit<AppNotification, 'id' | 'read'>>): void {
  const at = items.findIndex((x) => x.id === id);
  if (at < 0) return;
  const was = items[at]!;
  const textChanged = patch.text !== undefined && patch.text !== was.text;
  items[at] = { ...was, ...patch, read: textChanged ? false : was.read };
  emit();
}

export function dismiss(id: string): void {
  const at = items.findIndex((x) => x.id === id);
  if (at < 0) return;
  items.splice(at, 1);
  emit();
}

/** Newest first. */
export function notifications(): AppNotification[] {
  return [...items].sort((a, b) => b.time.getTime() - a.time.getTime());
}

export const unreadCount = (): number => items.filter((x) => !x.read).length;

export function markAllRead(): void {
  let changed = false;
  for (const x of items) if (!x.read) { x.read = true; changed = true; }
  if (changed) emit();
}

export function onNotificationsChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** For tests. */
export function clearNotifications(): void {
  items.length = 0;
  emit();
}
