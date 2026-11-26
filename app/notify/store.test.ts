import { beforeEach, describe, expect, it } from 'vitest';
import { clearNotifications, dismiss, markAllRead, notifications, notify, onNotificationsChange, unreadCount, updateNotification } from './store';

const at = (min: number) => new Date(Date.UTC(2026, 10, 22, 12, min));

describe('notifications', () => {
  beforeEach(() => clearNotifications());

  it('lists newest first', () => {
    notify({ id: 'a', kind: 'info', text: 'first', time: at(0) });
    notify({ id: 'b', kind: 'info', text: 'second', time: at(5) });
    expect(notifications().map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('a notification with the same id replaces the old one', () => {
    notify({ id: 'a', kind: 'download', text: 'Download started', progress: 0, time: at(0) });
    notify({ id: 'a', kind: 'download', text: 'Download started again', time: at(1) });
    expect(notifications()).toHaveLength(1);
    expect(notifications()[0]!.text).toBe('Download started again');
  });

  it('counts unread, and reading clears the count', () => {
    notify({ id: 'a', kind: 'info', text: 'x', time: at(0) });
    notify({ id: 'b', kind: 'info', text: 'y', time: at(1) });
    expect(unreadCount()).toBe(2);
    markAllRead();
    expect(unreadCount()).toBe(0);
  });

  it('progress alone keeps a read notification read; new words make it unread', () => {
    notify({ id: 'a', kind: 'download', text: 'Saving', progress: 0.1, time: at(0) });
    markAllRead();
    updateNotification('a', { progress: 0.5 });
    expect(unreadCount()).toBe(0);
    updateNotification('a', { text: 'Saved', progress: 1 });
    expect(unreadCount()).toBe(1);
  });

  it('dismiss removes it, and listeners hear every change', () => {
    let heard = 0;
    const off = onNotificationsChange(() => { heard += 1; });
    notify({ id: 'a', kind: 'info', text: 'x', time: at(0) });
    dismiss('a');
    expect(notifications()).toHaveLength(0);
    expect(heard).toBe(2);
    off();
    notify({ id: 'b', kind: 'info', text: 'y', time: at(0) });
    expect(heard).toBe(2);
  });

  it('updating or dismissing something that is not there does nothing', () => {
    updateNotification('nope', { text: 'x' });
    dismiss('nope');
    expect(notifications()).toHaveLength(0);
  });
});
