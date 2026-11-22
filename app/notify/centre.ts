// The Notification Centre: the bell's one panel. Weather alerts come first
// (app/alerts draws that section, exactly as issued, through renderAlertsSection),
// then the app's own notifications, newest first. The alert badge keeps its
// meaning; unread app notifications add a small dot on the bell.
import { formatMinutesAgo } from '../../core/units/format';
import { renderAlertsSection } from '../alerts/alerts';
import { icons } from '../shell/icons';
import { isOpenFrom, openPanel } from '../shell/panel';
import { markAllRead, notifications, onNotificationsChange, unreadCount, dismiss, type AppNotification } from './store';

const DOWNLOAD = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/></svg>';
const INFO = icons.info;

function row(n: AppNotification, now: Date): HTMLElement {
  const r = document.createElement('div');
  r.className = 'notice-row';
  r.dataset.id = n.id;
  r.dataset.kind = n.kind;
  r.innerHTML = `
    <span class="notice-icon" aria-hidden="true">${n.kind === 'download' ? DOWNLOAD : INFO}</span>
    <span class="notice-text"><span class="notice-words"></span><span class="notice-time"></span><span class="notice-bar" hidden><span></span></span></span>
    <button class="notice-dismiss" aria-label="Dismiss">${icons.close}</button>`;
  r.querySelector('.notice-words')!.textContent = n.text;
  r.querySelector('.notice-time')!.textContent = formatMinutesAgo(n.time, now);
  if (n.progress !== undefined && n.progress < 1) {
    const bar = r.querySelector<HTMLElement>('.notice-bar')!;
    bar.hidden = false;
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuenow', String(Math.round(n.progress * 100)));
    bar.querySelector<HTMLElement>('span')!.style.width = `${Math.round(n.progress * 100)}%`;
  }
  if (n.action) {
    const a = document.createElement('button');
    a.className = 'notice-action';
    a.textContent = n.action.label;
    a.addEventListener('click', () => n.action!.run());
    r.querySelector('.notice-text')!.append(a);
  }
  r.querySelector('.notice-dismiss')!.addEventListener('click', () => dismiss(n.id));
  return r;
}

function body(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'panel-groups';

  const alerts = document.createElement('div');
  alerts.className = 'group';
  alerts.innerHTML = '<span class="group-title">WEATHER ALERTS</span>';
  const slot = document.createElement('div');
  slot.className = 'alerts-slot';
  alerts.append(slot);
  const stopAlerts = renderAlertsSection(slot);

  const mine = document.createElement('div');
  mine.className = 'group';
  mine.innerHTML = '<span class="group-title">NOTIFICATIONS</span>';
  const list = document.createElement('div');
  list.className = 'notice-list';
  const empty = document.createElement('p');
  empty.className = 'panel-note';
  empty.textContent = 'Nothing new.';
  mine.append(list, empty);

  const draw = () => {
    const now = new Date();
    list.replaceChildren(...notifications().map((n) => row(n, now)));
    empty.hidden = list.children.length > 0;
  };
  draw();
  const off = onNotificationsChange(() => { draw(); markAllRead(); });
  // The panel's own close button and scrim end the subscription through onClose (see open()).
  (wrap as HTMLElement & { stop?: () => void }).stop = () => { off(); stopAlerts(); };
  wrap.append(alerts, mine);
  return wrap;
}

function open(bell: HTMLElement): void {
  const b = body();
  markAllRead();
  openPanel({
    origin: bell,
    icon: icons.bell,
    title: 'Notification Centre',
    caption: 'Weather alerts, then the app’s own',
    body: b,
    onClose: () => (b as HTMLElement & { stop?: () => void }).stop?.(),
  });
}

/** Wire the bell: it opens the Notification Centre, and a dot shows while app notifications are unread. */
export function setupNotifications(bell: HTMLElement): void {
  const syncDot = () => { bell.dataset.unread = String(unreadCount() > 0); };
  onNotificationsChange(syncDot);
  syncDot();
  bell.addEventListener('click', () => { if (!isOpenFrom(bell)) open(bell); });
}
