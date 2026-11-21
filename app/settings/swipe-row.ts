// A list row you swipe left to delete, as in mail and messages. Swiping left
// slides the row aside and shows a Delete button; swiping back or tapping
// elsewhere closes it. The Delete button is a real button, so it also works
// from the keyboard and a screen reader. Controls stay neutral: no colour.
const REVEAL = 88; // px the row slides to show Delete
const OPEN_AT = 36; // px of drag that is enough to stay open

export interface SwipeRowOptions {
  /** The row's content (an icon row, for example). */
  content: HTMLElement;
  /** What the Delete button is called for assistive tech, e.g. "Delete Squamish". */
  label: string;
  onDelete(): Promise<void> | void;
}

export function swipeRow(opts: SwipeRowOptions): HTMLElement {
  const row = document.createElement('div');
  row.className = 'swipe-row';
  const del = document.createElement('button');
  del.className = 'swipe-delete';
  del.textContent = 'Delete';
  del.setAttribute('aria-label', opts.label);
  del.tabIndex = -1;
  const face = document.createElement('div');
  face.className = 'swipe-face';
  face.append(opts.content);
  del.style.opacity = '0';
  row.append(del, face);

  let startX = 0, startY = 0, base = 0, dx = 0, dragging = false, decided = false, open = false;
  const setX = (x: number, animate: boolean) => {
    face.style.transition = animate ? 'transform 180ms ease-out' : 'none';
    face.style.transform = `translateX(${x}px)`;
    // Delete only shows as the row slides away, so it never ghosts through the row.
    del.style.opacity = String(Math.max(0, Math.min(1, -x / 24)));
  };
  const settle = (to: boolean) => {
    open = to;
    del.tabIndex = to ? 0 : -1;
    row.dataset.open = String(to);
    setX(to ? -REVEAL : 0, true);
  };

  face.addEventListener('pointerdown', (e) => {
    startX = e.clientX; startY = e.clientY; base = open ? -REVEAL : 0; dx = 0; dragging = true; decided = false;
  });
  face.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const mx = e.clientX - startX, my = e.clientY - startY;
    if (!decided) {
      // A mostly vertical move is the panel scrolling, not a swipe.
      if (Math.abs(my) > 8 && Math.abs(my) > Math.abs(mx)) { dragging = false; return; }
      if (Math.abs(mx) < 6) return;
      decided = true;
      face.setPointerCapture(e.pointerId);
    }
    dx = mx;
    setX(Math.max(-REVEAL - 24, Math.min(0, base + dx)), false);
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    if (!decided) { if (open) settle(false); return; }
    const x = base + dx;
    settle(x < -OPEN_AT);
  };
  face.addEventListener('pointerup', end);
  face.addEventListener('pointercancel', end);
  del.addEventListener('click', async () => {
    del.disabled = true;
    row.dataset.busy = 'true';
    try { await opts.onDelete(); row.remove(); } catch { del.disabled = false; row.dataset.busy = 'false'; }
  });
  return row;
}
