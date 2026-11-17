// The issuer's HTML (forecast highlights, summaries, problem comments),
// shown with its own words and structure but only safe parts: paragraphs,
// emphasis, lists, line breaks and https links. Everything else keeps its
// text and loses its tag. Nothing is re-worded.

const KEEP = new Set(['P', 'STRONG', 'B', 'EM', 'I', 'UL', 'OL', 'LI', 'BR', 'A']);
/** Headings are kept as emphasised paragraphs, so the panel's own type stays in charge. */
const AS_STRONG = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

function clean(src: Node, doc: Document): Node[] {
  const out: Node[] = [];
  src.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) { out.push(doc.createTextNode(n.textContent ?? '')); return; }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const e = n as Element;
    if (e.tagName === 'SCRIPT' || e.tagName === 'STYLE' || e.tagName === 'IMG' || e.tagName === 'IFRAME') return;
    const kids = clean(e, doc);
    if (AS_STRONG.has(e.tagName)) {
      const p = doc.createElement('p');
      const s = doc.createElement('strong');
      s.append(...kids);
      p.append(s);
      out.push(p);
      return;
    }
    if (!KEEP.has(e.tagName)) { out.push(...kids); return; }
    const c = doc.createElement(e.tagName.toLowerCase());
    if (e.tagName === 'A') {
      const href = e.getAttribute('href') ?? '';
      if (!/^https?:\/\//i.test(href)) { out.push(...kids); return; }
      c.setAttribute('href', href.replace(/^http:/i, 'https:'));
      c.setAttribute('target', '_blank');
      c.setAttribute('rel', 'noopener noreferrer');
    }
    c.append(...kids);
    out.push(c);
  });
  return out;
}

/** A block of the issuer's HTML, made safe; empty paragraphs dropped. */
export function issuedHtml(html: string, doc: Document = document): HTMLElement {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const box = doc.createElement('div');
  box.className = 'avy-text';
  box.append(...clean(parsed.body, doc));
  box.querySelectorAll('p').forEach((p) => { if (!p.textContent?.trim()) p.remove(); });
  return box;
}
