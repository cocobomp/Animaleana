// Sellerie : le catalogue (par rayon) et la fiche d'un objet — image 3D, phrase pour enfant,
// effet en jeu, tailles, couleurs et prix — avec « Essayer sur… » (aperçu sur un de nos animaux),
// « Acheter » et « Équiper ». Aussi l'équipement dans la fiche d'un animal.

import { h } from './dom.js';
import { t } from '../i18n.js';
import {
  GEAR, TACK_CATEGORIES, COLORS, SIZES, gearPrice, sizeOf, fitReason, stockOf, ownedVariant, freeStock,
  wornBy, defaultSize, riderHelmet, sizeFor, swapSize,
} from '../sim/gear.js';
import { TOOLS, hasTool } from '../sim/tools.js';
import { SPECIES } from '../sim/species.js';
import { isSandbox, canAfford } from '../sim/profile.js';
import { TackThumbs } from '../game/tackThumbs.js';

const hex = (key) => `#${(COLORS[key] ?? 0x888888).toString(16).padStart(6, '0')}`;
const name = (id) => t(`gear_${id}`);
const catOf = (id) => TACK_CATEGORIES.find((c) => c.items.includes(id))?.id ?? 'saddle';

// Ce qu'on regardait (on y revient quand on rouvre la sellerie).
const shop = { tab: 'saddle', id: null, color: {}, size: {}, pick: null, tryUrl: null, tryName: '', tryFor: null };

function thumbs(g) {
  g.tackThumbs = g.tackThumbs ?? new TackThumbs(g);
  return g.tackThumbs;
}

/** Couleur choisie pour ce modèle (dans la fiche), sinon celle déjà choisie avant, sinon la première. */
function colorOf(p, id) {
  const def = GEAR[id];
  const c = shop.color[id] ?? p.tackColors?.[id];
  return def.colors?.includes(c) ? c : def.colors?.[0];
}

/** Animaux d'ici qui peuvent porter cet objet (espèce et taille). */
const fitting = (g, id) => g.animalsHere().filter((a) => !fitReason(id, a) && !a.client);

/** Taille proposée à l'achat : celle du premier animal d'ici à qui l'objet va, sinon la taille par défaut. */
function sizeChoice(g, id) {
  const def = GEAR[id];
  if (!def.sizes) return null;
  if (def.sizes.includes(shop.size[id])) return shop.size[id];
  const a = fitting(g, id).find((x) => sizeOf(x));
  return a ? sizeOf(a) : defaultSize(id);
}

const priceLabel = (p, id, size) => (isSandbox(p) ? t('tk_free') : `${gearPrice(id, size ?? defaultSize(id))} 🪙`);

// ---------------------------------------------------------------- catalogue

/** Le catalogue : depuis le comptoir, le coffre (« Mon matériel ») ou le raccourci du menu. */
export function openTackShop(ui, opts = {}) {
  if (opts.tab) shop.tab = opts.tab;
  ui.openPanel({ title: `🏇 ${t('tk_title')}`, kind: 'tack', render: () => renderShop(ui) });
}

function renderShop(ui) {
  const g = ui.game;
  const p = g.profile;
  const inside = g.interiors?.inside === 'tackroom';
  const canGo = !inside && !!g.world.interiors?.tackroom;
  const tabs = [...TACK_CATEGORIES.map((c) => [c.id, c.emoji]), ['tools', '🧰'], ['mine', '🎒']];
  const th = thumbs(g);
  th.begin();
  const out = [
    canGo ? h('button', { class: 'primary big tk-go', onClick: () => { ui.closePanel(); g.interiors.enter('tackroom'); } }, `🚪 ${t('tk_goInside')}`) : null,
    h('p', { class: 'note' }, inside ? t('tk_welcome') : canGo ? t('tk_shortcut') : t('tackHelp')),
    h('div', { class: 'tk-tabs', role: 'tablist' }, tabs.map(([id, emoji]) => h('button', {
      class: `small ${shop.tab === id ? 'primary' : ''}`,
      role: 'tab',
      'aria-selected': shop.tab === id ? 'true' : 'false',
      onClick: () => { shop.tab = id; ui.renderPanel(); },
    }, `${emoji} ${t(`tk_cat_${id}`)}`))),
  ];
  if (shop.tab === 'tools') out.push(toolsList(ui));
  else if (shop.tab === 'mine') out.push(...mineList(ui));
  else {
    const cat = TACK_CATEGORIES.find((c) => c.id === shop.tab) ?? TACK_CATEGORIES[0];
    out.push(h('div', { class: 'cards' }, cat.items.map((id) => itemCard(ui, id))));
  }
  th.end();
  return out;
}

function itemCard(ui, id) {
  const g = ui.game;
  const p = g.profile;
  const def = GEAR[id];
  const own = ownedVariant(p, id);
  const img = thumbs(g).item(id, colorOf(p, id), [192, 144]);
  return h('button', { class: 'card tk-card', onClick: () => openTackItem(ui, id) },
    img ? h('img', { class: 'tk-thumb', src: img, alt: '' }) : h('span', { class: 'card-emoji' }, def.emoji),
    h('span', { class: 'card-main' },
      h('b', {}, name(id)),
      h('small', {}, `${t(`tk_disc_${def.discipline}`)}${def.sizes ? ` · ${def.sizes.map((s) => t(`tk_size_${s}`)).join(' / ')}` : ''}`),
      h('small', { class: own ? 'tk-mine' : '' }, own ? t('tk_owned', { n: own }) : t(`tk_d_${id}`))),
    h('span', { class: 'card-side' }, h('b', { class: 'tk-price' }, priceLabel(p, id))));
}

function toolsList(ui) {
  const g = ui.game;
  const p = g.profile;
  const sandbox = isSandbox(p);
  return h('div', { class: 'cards' }, h('p', { class: 'note' }, t('toolsHelp')), Object.entries(TOOLS).map(([tool, def]) => {
    const have = hasTool(p, tool);
    return h('div', { class: 'card' },
      h('span', { class: 'card-emoji' }, def.emoji),
      h('span', { class: 'card-main' }, h('b', {}, t(`tool_${tool}`)), h('small', {}, t(`toold_${tool}`))),
      have ? h('span', { class: 'card-side' }, '✅')
        : h('button', { class: 'primary', onClick: () => { g.buyTool(tool); ui.renderPanel(); } }, sandbox ? t('buy') : `${t('buy')} · ${def.price} 🪙`));
  }));
}

/** « Mon matériel » : ce qu'on possède, rangé au mur ou porté par nos animaux. */
function mineList(ui) {
  const g = ui.game;
  const p = g.profile;
  const ids = Object.keys(GEAR).filter((id) => ownedVariant(p, id) > 0);
  if (!ids.length) return [h('p', { class: 'note' }, t('tk_mineNothing'))];
  return [h('p', { class: 'note' }, t('tk_mineHelp')), h('div', { class: 'cards' }, ids.map((id) => {
    const def = GEAR[id];
    const lines = def.sizes
      ? stockOf(p, id).map((s) => t('tk_stockLine', { size: t(`tk_size_${s.size}`), n: s.owned, free: Math.max(0, s.free) }))
      : [t('tk_owned', { n: ownedVariant(p, id) })];
    const who = (def.sizes ?? [null]).flatMap((s) => wornBy(p, id, s ?? defaultSize(id))).map((a) => a.name);
    if (def.type === 'helmet' && riderHelmet(p)?.item === id) who.push('⛑️');
    return h('button', { class: 'card tk-card', onClick: () => openTackItem(ui, id) },
      h('img', { class: 'tk-thumb', src: thumbs(g).item(id, colorOf(p, id), [192, 144]), alt: '' }),
      h('span', { class: 'card-main' }, h('b', {}, name(id)), ...lines.map((l) => h('small', {}, l)),
        who.length ? h('small', { class: 'tk-mine' }, t('tk_onAnimals', { names: who.join(', ') })) : null));
  }))];
}

// ---------------------------------------------------------------- fiche d'un objet

/** Fiche d'un objet : image, description, effet, tailles, couleurs, prix ; essayer, acheter, équiper. */
export function openTackItem(ui, id) {
  if (!GEAR[id]) return;
  if (shop.id !== id) {
    shop.pick = null;
    shop.tryUrl = null;
  }
  shop.id = id;
  shop.tab = catOf(id);
  ui.openPanel({ title: () => `${GEAR[id].emoji} ${name(id)}`, kind: 'tack', render: () => renderItem(ui, id) });
}

function renderItem(ui, id) {
  const g = ui.game;
  const p = g.profile;
  const def = GEAR[id];
  const sandbox = isSandbox(p);
  const color = colorOf(p, id);
  const size = sizeChoice(g, id);
  const helmet = def.type === 'helmet';
  const own = ownedVariant(p, id);
  const fits = fitting(g, id);
  const th = thumbs(g);
  th.begin();
  const pic = shop.tryUrl && shop.tryFor === `${id}|${color}`
    ? h('figure', { class: 'tk-pic try' }, h('img', { src: shop.tryUrl, alt: '' }),
      h('figcaption', {}, h('b', {}, t('tk_tryResult', { name: shop.tryName, item: name(id) })), h('small', {}, t('tk_tryHint'))))
    : h('figure', { class: 'tk-pic' }, h('img', { src: th.item(id, color, [360, 250]), alt: name(id) }));
  th.end();

  const out = [
    h('button', { class: 'small tk-back', onClick: () => openTackShop(ui) }, `← ${t('tk_back')}`),
    pic,
    h('div', { class: 'chips' },
      h('span', { class: 'chip tk-disc' }, t(`tk_disc_${def.discipline}`)),
      own ? h('span', { class: 'chip tk-own' }, t('tk_owned', { n: own })) : h('span', { class: 'chip' }, t('tk_ownedNone'))),
    h('p', { class: 'tk-desc' }, t(`tk_d_${id}`)),
    h('p', { class: 'tk-fx' }, h('b', {}, `🎮 ${t('tk_effect')} : `), t(`geard_${id}`)),
    def.minObedience ? h('p', { class: 'note' }, `🎓 ${t('tk_reqObedience', { n: def.minObedience })}`) : null,
  ];

  // Couleurs.
  if (def.colors?.length > 1) {
    out.push(h('h3', {}, `${t('tk_colors')} : ${t(`col_${color}`)}`), h('div', { class: 'swatches' }, def.colors.map((c) => h('button', {
      class: `swatch-btn ${c === color ? 'selected' : ''}`,
      style: { background: hex(c) },
      'aria-label': t(`col_${c}`),
      title: t(`col_${c}`),
      onClick: () => { shop.color[id] = c; p.tackColors = { ...(p.tackColors ?? {}), [id]: c }; ui.renderPanel(); },
    }))));
  }

  // Tailles (poney / cheval / trait) et ce qu'on a déjà.
  if (def.sizes) {
    out.push(h('h3', {}, t('tk_sizes')), h('div', { class: 'row wrap tk-sizes' }, SIZES.map((s) => h('button', {
      class: `small ${s === size ? 'primary' : ''}`,
      disabled: !def.sizes.includes(s),
      onClick: () => { shop.size[id] = s; ui.renderPanel(); },
    }, `${{ pony: '🐴', horse: '🐎', draft: '🐴💪' }[s]} ${t(`tk_size_${s}`)}${sandbox ? '' : ` · ${gearPrice(id, s)} 🪙`}`))));
    const stock = stockOf(p, id);
    for (const s of stock) out.push(h('p', { class: 'note' }, t('tk_stockLine', { size: t(`tk_size_${s.size}`), n: s.owned, free: Math.max(0, s.free) })));
    // Échange gratuit : un exemplaire rangé d'une autre taille contre la taille choisie.
    for (const s of stock.filter((x) => x.free > 0 && x.size !== size)) {
      out.push(h('button', { class: 'small tk-swap', onClick: () => {
        if (swapSize(p, id, s.size, size).ok) ui.toast(t('tk_swapped', { size: t(`tk_size_${size}`) }));
        ui.renderPanel();
      } }, `🔁 ${t('tk_swap', { from: t(`tk_size_${s.size}`), to: t(`tk_size_${size}`) })}`));
    }
  }
  const who = (def.sizes ?? [null]).flatMap((s) => wornBy(p, id, s ?? defaultSize(id))).map((a) => a.name);
  if (who.length) out.push(h('p', { class: 'note tk-mine' }, t('tk_onAnimals', { names: who.join(', ') })));
  if (!helmet && def.species.some((sp) => sp !== 'rider')) {
    out.push(h('p', { class: 'note' }, fits.length
      ? t('tk_fits', { names: fits.map((a) => `${a.name}${sizeOf(a) ? ` (${t(`tk_size_${sizeOf(a)}`)})` : ''}`).join(', ') })
      : t('tk_fitsNone')));
  }

  // Boutons : essayer, acheter, équiper (ou mettre sa bombe).
  const price = gearPrice(id, size ?? defaultSize(id));
  const wearing = helmet && riderHelmet(p)?.item === id;
  out.push(h('div', { class: 'tk-actions' },
    !helmet ? h('button', { class: `big-action ${shop.pick === 'try' ? 'primary' : ''}`, onClick: () => { shop.pick = shop.pick === 'try' ? null : 'try'; ui.renderPanel(); } },
      h('span', { class: 'ba-icon' }, '👀'), h('span', { class: 'ba-text' }, h('b', {}, t('tk_tryOn')))) : null,
    h('button', {
      class: 'big-action primary',
      disabled: !canAfford(p, price),
      onClick: () => {
        const r = g.buyGear(id, size);
        if (r?.ok) {
          p.tackColors = { ...(p.tackColors ?? {}), [id]: color };
          g.interiors?.refreshTack?.();
        }
        ui.renderPanel();
      },
    }, h('span', { class: 'ba-icon' }, '🛒'), h('span', { class: 'ba-text' },
      h('b', {}, def.sizes && def.sizes.length > 1 ? t('tk_buySize', { size: t(`tk_size_${size}`) }) : t('tk_buy')),
      h('small', {}, sandbox ? t('tk_free') : `${price} 🪙`))),
    helmet
      ? h('button', { class: 'big-action', disabled: !own || wearing, onClick: () => { g.equipHelmet(id, color); ui.renderPanel(); } },
        h('span', { class: 'ba-icon' }, '⛑️'), h('span', { class: 'ba-text' }, h('b', {}, wearing ? t('tk_wearing') : t('tk_wear'))))
      : h('button', { class: `big-action ${shop.pick === 'equip' ? 'primary' : ''}`, disabled: !own, onClick: () => { shop.pick = shop.pick === 'equip' ? null : 'equip'; ui.renderPanel(); } },
        h('span', { class: 'ba-icon' }, '✅'), h('span', { class: 'ba-text' }, h('b', {}, t('tk_equip'))))));

  // Choisir l'animal (essayage ou équipement).
  if (shop.pick) {
    const list = fits;
    out.push(h('div', { class: 'tk-pick' },
      h('b', {}, shop.pick === 'try' ? t('tk_tryOn') : t('tk_equipWho')),
      list.length ? h('div', { class: 'row wrap' }, list.map((a) => h('button', {
        class: 'small',
        onClick: () => (shop.pick === 'try' ? tryOn(ui, id, a, color) : equipOn(ui, id, a, color)),
      }, `${SPECIES[a.species].emoji} ${a.name}`))) : h('p', { class: 'note' }, shop.pick === 'try' ? t('tk_tryNobody') : t('tk_equipNobody'))));
  }
  return out;
}

/** Essayage : l'objet sur l'animal choisi, photographié à part (rien n'est acheté ni changé). */
function tryOn(ui, id, a, color) {
  const g = ui.game;
  const e = g.entities.get(a.id);
  if (!e) return ui.toast(t('tk_tryNobody'));
  const def = GEAR[id];
  const gear = { ...(a.gear ?? {}), [def.slot]: { item: id, color, size: sizeFor(id, a) } };
  shop.tryUrl = thumbs(g).onAnimal(e, gear);
  shop.tryName = a.name;
  shop.tryFor = `${id}|${color}`;
  shop.pick = null;
  ui.renderPanel();
}

function equipOn(ui, id, a, color) {
  const g = ui.game;
  const r = g.equip(a, id, color);
  if (r?.ok) {
    ui.toast(t('tk_equipped', { item: name(id), name: a.name }));
    shop.pick = null;
    g.interiors?.refreshTack?.();
  }
  ui.renderPanel();
}

// ---------------------------------------------------------------- dans la fiche d'un animal

const SLOT_ORDER = ['saddle', 'pad', 'bridle', 'halter', 'blanket', 'legs', 'bells', 'head', 'neck', 'leash'];

/** Équipement d'un animal : ce qu'il porte, par emplacement, et ce qu'on a de rangé qui lui va. */
export function animalGearSection(ui, a) {
  const g = ui.game;
  const p = g.profile;
  const forMe = (id) => GEAR[id].species.includes(a.species);
  const slots = SLOT_ORDER.filter((slot) => Object.keys(GEAR).some((id) => GEAR[id].slot === slot && forMe(id)));
  if (!slots.length) return null;
  // Rangé à la sellerie et à sa taille (à la maison, une autre taille s'échange toute seule).
  const spareOf = (id) => !fitReason(id, a) && (freeStock(p, id, sizeFor(id, a)) > 0
    || (g.isHome && (GEAR[id].sizes ?? []).some((sz) => freeStock(p, id, sz) > 0)));
  const rows = slots.map((slot) => {
    const worn = a.gear?.[slot];
    const spare = Object.keys(GEAR).filter((id) => GEAR[id].slot === slot && worn?.item !== id && spareOf(id));
    return { slot, worn, spare };
  }).filter((r) => r.worn || r.spare.length);
  const firstCat = catOf(Object.keys(GEAR).find(forMe));
  return h('div', { class: 'gear-list' },
    rows.length ? rows.map(({ slot, worn, spare }) => h('div', { class: 'gear-row' },
      h('span', { class: 'gear-name' }, h('small', { class: 'tk-slot' }, t(`tk_slot_${slot}`)), ' ',
        worn ? h('b', {}, `${GEAR[worn.item].emoji} ${name(worn.item)}`) : h('span', { class: 'note' }, t('tk_none')),
        worn?.color ? h('span', { class: 'swatch-dot tk-dot', style: { background: hex(worn.color) } }) : null),
      worn ? h('button', { class: 'small', onClick: () => { g.unequip(a, slot); ui.renderPanel(); } }, t('gearRemove')) : null,
      ...spare.slice(0, 3).map((id) => h('button', { class: 'small primary', onClick: () => { g.equip(a, id, colorOf(p, id)); ui.renderPanel(); } }, `${GEAR[id].emoji} ${name(id)}`))))
      : h('p', { class: 'note' }, t('tk_gearNone')),
    h('button', { class: 'small tk-goshop', onClick: () => openTackShop(ui, { tab: firstCat }) }, `🏇 ${t('tk_goShop')}`));
}
