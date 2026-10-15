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

export function bar(label, value, kind = '') {
  const v = Math.round(value);
  const level = v >= 60 ? 'good' : v >= 30 ? 'mid' : 'low';
  return h('div', { class: `bar ${kind}` },
    h('span', { class: 'bar-label' }, label),
    h('span', { class: 'bar-track' }, h('span', { class: `bar-fill ${level}`, style: { width: `${v}%` } })),
    h('span', { class: 'bar-value' }, v));
}
