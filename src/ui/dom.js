// Petit utilitaire pour fabriquer l'interface en HTML sans bibliothèque.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const hexColor = (n) => `#${n.toString(16).padStart(6, '0')}`;

let safeProbe = null;

/**
 * Marges de sécurité de l'écran en pixels (encoche, barre d'accueil) : { t, r, b, l }.
 * Lues sur un petit élément invisible qui a pour padding les variables --safe-* du CSS (env(safe-area-inset-*)).
 */
export function safeInsets() {
  if (typeof document === 'undefined') return { t: 0, r: 0, b: 0, l: 0 };
  if (!safeProbe?.isConnected) {
    safeProbe = h('div', { 'aria-hidden': 'true', style: {
      position: 'fixed', left: '0', top: '0', width: '0', height: '0', visibility: 'hidden', pointerEvents: 'none',
      padding: 'var(--safe-t) var(--safe-r) var(--safe-b) var(--safe-l)',
    } });
    document.body.append(safeProbe);
  }
  const s = getComputedStyle(safeProbe);
  const px = (v) => parseFloat(v) || 0;
  return { t: px(s.paddingTop), r: px(s.paddingRight), b: px(s.paddingBottom), l: px(s.paddingLeft) };
}

/** Écran de téléphone : étroit (portrait) ou peu haut (paysage). Même règle que le CSS (@media … 640px / 480px). */
export const isPhone = () => window.innerWidth <= 640 || window.innerHeight <= 480;

export function bar(label, value, kind = '') {
  const v = Math.round(value);
  const level = v >= 60 ? 'good' : v >= 30 ? 'mid' : 'low';
  return h('div', { class: `bar ${kind}` },
    h('span', { class: 'bar-label' }, label),
    h('span', { class: 'bar-track' }, h('span', { class: `bar-fill ${level}`, style: { width: `${v}%` } })),
    h('span', { class: 'bar-value' }, v));
}
