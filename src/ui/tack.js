// Sellerie : le catalogue (par rayon) et la fiche d'un objet — vignette 3D, phrase pour enfant,
// effet en jeu, tailles, couleurs et prix — avec « Essayer sur… » (aperçu sur un de nos animaux),
// « Acheter » et « Équiper ». Aussi l'équipement dans la fiche d'un animal.

import { h } from './dom.js';
import { t } from '../i18n.js';
import {
  GEAR, TACK_CATEGORIES, COLORS, SIZES, gearPrice, sizeOf, fitReason, stockOf, ownedVariant, freeStock,
  wornBy, defaultSize, riderHelmet, sizeFor, swapSize, isAway, atHomeCount,
} from '../sim/gear.js';
import { TOOLS, hasTool } from '../sim/tools.js';
import { SPECIES } from '../sim/species.js';
import { isSandbox, canAfford } from '../sim/profile.js';
import { thumb, thumbsFor, photoDouble } from '../game/thumbScenes.js'; // vignettes 3D (src/game/thumbs.js)
import { aboveGround } from '../game/thumbs.js';
import * as THREE from 'three';

const hex = (key) => `#${(COLORS[key] ?? 0x888888).toString(16).padStart(6, '0')}`;
const name = (id) => t(`gear_${id}`);
const catOf = (id) => TACK_CATEGORIES.find((c) => c.items.includes(id))?.id ?? 'saddle';

// Ce qu'on regardait (on y revient quand on rouvre la sellerie).
const shop = { tab: 'saddle', id: null, color: {}, size: {}, pick: null, tryUrl: null, tryName: '', tryFor: null, trying: false };

/**
 * Vignette d'un objet : sur son support (porte-selle, pied de bombe) ou porté par un cheval mannequin,
 * à la couleur et à la taille choisies (l'image change quand on change l'une ou l'autre).
 */
function gearThumb(g, id, color, size, opts) {
  const def = GEAR[id];
  return thumb(g, { kind: 'gear', id, color, size: def.sizes ? size ?? defaultSize(id) : undefined }, { emoji: def.emoji, alt: name(id), ...opts });
}

/** Nouvelle photo d'essayage (ou aucune) : l'ancienne image est libérée (elle n'est pas dans le cache des vignettes). */
function setTryUrl(url) {
  if (shop.tryUrl && shop.tryUrl !== url) {
    try {
      URL.revokeObjectURL(shop.tryUrl);
    } catch {
      /* rien à libérer */
    }
  }
  shop.tryUrl = url;
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

/**
 * « Taille Cheval : 2 · 1 rangé au mur » (singulier / pluriel) ; en voyage, « · 1 dans le coffre »
 * (stockOf compte alors le coffre et ce que portent les animaux d'ici, src/sim/gear.js).
 */
const stockText = (p, s) => t('tk_stockLine', { size: t(`tk_size_${s.size}`), n: s.owned })
  + (s.free > 0 ? t(isAway(p) ? 'tk_stockFreeAway' : 'tk_stockFree', { n: s.free }) : '');

/** « À toi : 2 » ; en voyage, « Avec toi ici : 1 » (le reste est à la maison). */
const ownedText = (p, n) => t(isAway(p) ? 'tk_ownedAway' : 'tk_owned', { n });

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
  const out = [
    canGo ? h('button', { class: 'primary big tk-go', onClick: () => { ui.closePanel(); g.interiors.enter('tackroom'); } }, `🚪 ${t('tk_goInside')}`) : null,
    h('p', { class: 'note' }, inside ? t('tk_welcome') : canGo ? t('tk_shortcut') : t('tackHelp')),
    // En voyage : seul le coffre est là (src/sim/cargo.js) ; ce qu'on achète y va.
    isAway(p) ? h('p', { class: 'note tk-away' }, t('tk_awayShop')) : null,
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
  return out;
}

function itemCard(ui, id) {
  const g = ui.game;
  const p = g.profile;
  const def = GEAR[id];
  const own = ownedVariant(p, id);
  return h('button', { class: 'card tk-card', onClick: () => openTackItem(ui, id) },
    gearThumb(g, id, colorOf(p, id), sizeChoice(g, id), { w: 88, h: 66, cls: 'tk-thumb', alt: '' }),
    h('span', { class: 'card-main' },
      h('b', {}, name(id)),
      h('small', {}, `${t(`tk_disc_${def.discipline}`)}${def.sizes ? ` · ${def.sizes.map((s) => t(`tk_size_${s}`)).join(' / ')}` : ''}`),
      h('small', { class: own ? 'tk-mine' : '' }, own ? ownedText(p, own) : t(`tk_d_${id}`))),
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
  // (en voyage : ce qui est dans le coffre, puis ce qui attend à la maison)
  const ids = Object.keys(GEAR).filter((id) => ownedVariant(p, id) > 0 || atHomeCount(p, id) > 0);
  if (!ids.length) return [h('p', { class: 'note' }, t('tk_mineNothing'))];
  return [h('p', { class: 'note' }, t(isAway(p) ? 'tk_mineHelpAway' : 'tk_mineHelp')), h('div', { class: 'cards' }, ids.map((id) => {
    const def = GEAR[id];
    const lines = def.sizes
      ? stockOf(p, id).map((s) => stockText(p, s))
      : ownedVariant(p, id) ? [ownedText(p, ownedVariant(p, id))] : [];
    if (atHomeCount(p, id) > 0) lines.push(t('tk_atHome', { n: atHomeCount(p, id) }));
    const who = (def.sizes ?? [null]).flatMap((s) => wornBy(p, id, s ?? defaultSize(id))).map((a) => a.name);
    if (def.type === 'helmet' && riderHelmet(p)?.item === id) who.push(t('tk_you')); // la bombe : sur ta tête
    return h('button', { class: 'card tk-card', onClick: () => openTackItem(ui, id) },
      gearThumb(g, id, colorOf(p, id), sizeChoice(g, id), { w: 88, h: 66, cls: 'tk-thumb', alt: '' }),
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
    setTryUrl(null);
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
  // La grande vignette (à la couleur et à la taille choisies) ; après un essayage, la photo sur l'animal
  // avec l'objet seul en médaillon, pour comparer.
  const pic = shop.tryUrl && shop.tryFor === `${id}|${color}`
    ? h('figure', { class: `tk-pic try ${shop.trying ? 'wait' : ''}` }, h('img', { src: shop.tryUrl, alt: '' }),
      gearThumb(g, id, color, size, { w: 120, h: 90, cls: 'tk-inset', hold: `tk-inset:${id}` }),
      shop.trying ? h('span', { class: 'tk-trying' }, `👀 ${t('tk_tryOn')}…`) : null,
      h('figcaption', {}, h('b', {}, t('tk_tryResult', { name: shop.tryName, item: name(id) })), h('small', {}, t('tk_tryHint'))))
    : h('figure', { class: 'tk-pic' }, gearThumb(g, id, color, size, { w: 360, h: 250, cls: 'tk-big', urgent: true, hold: `tk-big:${id}` }),
      shop.trying ? h('span', { class: 'tk-trying' }, `👀 ${t('tk_tryOn')}…`) : null);

  const out = [
    h('button', { class: 'small tk-back', onClick: () => openTackShop(ui) }, `← ${t('tk_back')}`),
    pic,
    h('div', { class: 'chips' },
      h('span', { class: 'chip tk-disc' }, t(`tk_disc_${def.discipline}`)),
      // (en voyage : ce qui est resté à la maison n'est pas « pas encore à toi »)
      own ? h('span', { class: 'chip tk-own' }, ownedText(p, own))
        : h('span', { class: 'chip' }, atHomeCount(p, id) > 0 ? t('gearAtHome') : t('tk_ownedNone'))),
    h('p', { class: 'tk-desc' }, t(`tk_d_${id}`)),
    h('p', { class: 'tk-fx' }, h('b', {}, `🎮 ${t('tk_effect')} : `), t(`geard_${id}`)),
    def.minObedience ? h('p', { class: 'note' }, `🎓 ${t('tk_reqObedience', { n: def.minObedience })}`) : null,
  ];

  // Petit aperçu à côté du choix de la couleur (ou de la taille) : sur un téléphone, la grande image est
  // déjà sortie de l'écran quand on touche une couleur ; celui-ci change sous le doigt.
  let mini = def.colors?.length > 1 || def.sizes ? gearThumb(g, id, color, size, { w: 76, h: 57, cls: 'tk-mini', alt: '', urgent: true, hold: `tk-mini:${id}` }) : null;
  const head = (title) => {
    const el = mini ? h('div', { class: 'tk-choice-head' }, h('h3', {}, title), mini) : h('h3', {}, title);
    mini = null;
    return el;
  };

  // Couleurs.
  if (def.colors?.length > 1) {
    out.push(head(`${t('tk_colors')} : ${t(`col_${color}`)}`), h('div', { class: 'swatches' }, def.colors.map((c) => h('button', {
      class: `swatch-btn ${c === color ? 'selected' : ''}`,
      style: { background: hex(c) },
      'aria-label': t(`col_${c}`),
      title: t(`col_${c}`),
      onClick: () => { shop.color[id] = c; p.tackColors = { ...(p.tackColors ?? {}), [id]: c }; ui.renderPanel(); },
    }))));
  }

  // Tailles (poney / cheval / trait) et ce qu'on a déjà.
  if (def.sizes) {
    out.push(head(t('tk_sizes')), h('div', { class: 'row wrap tk-sizes' }, SIZES.map((s) => h('button', {
      class: `small ${s === size ? 'primary' : ''}`,
      disabled: !def.sizes.includes(s),
      onClick: () => { shop.size[id] = s; ui.renderPanel(); },
    }, `${{ pony: '🐴', horse: '🐎', draft: '🐴💪' }[s]} ${t(`tk_size_${s}`)}${sandbox ? '' : ` · ${gearPrice(id, s)} 🪙`}`))));
    const stock = stockOf(p, id);
    for (const s of stock) out.push(h('p', { class: 'note' }, stockText(p, s)));
    // Échange gratuit : un exemplaire rangé d'une autre taille contre la taille choisie (à la maison seulement).
    for (const s of stock.filter((x) => x.free > 0 && x.size !== size && !isAway(p))) {
      out.push(h('button', { class: 'small tk-swap', onClick: () => {
        if (swapSize(p, id, s.size, size).ok) ui.toast(t('tk_swapped', { size: t(`tk_size_${size}`) }));
        ui.renderPanel();
      } }, `🔁 ${t('tk_swap', { from: t(`tk_size_${s.size}`), to: t(`tk_size_${size}`) })}`));
    }
  }
  const who = (def.sizes ?? [null]).flatMap((s) => wornBy(p, id, s ?? defaultSize(id))).map((a) => a.name);
  if (who.length) out.push(h('p', { class: 'note tk-mine' }, t('tk_onAnimals', { names: who.join(', ') })));
  if (atHomeCount(p, id) > 0) out.push(h('p', { class: 'note tk-athome' }, t('tk_atHome', { n: atHomeCount(p, id) })));
  if (!helmet && def.species.some((sp) => sp !== 'rider')) {
    out.push(h('p', { class: 'note' }, fits.length
      ? t('tk_fits', { names: fits.map((a) => `${a.name}${sizeOf(a) ? ` (${t(`tk_size_${sizeOf(a)}`)})` : ''}`).join(', ') })
      : t('tk_fitsNone')));
  }

  // Boutons : essayer, acheter, équiper (ou mettre sa bombe).
  const price = gearPrice(id, size ?? defaultSize(id));
  const missing = canAfford(p, price) ? 0 : price - (p.money ?? 0); // mode argent : il manque des pièces
  const wearing = helmet && riderHelmet(p)?.item === id;
  // Essayer : une photo de l'animal (moteur des vignettes) ; sans WebGL (repli emoji), pas de bouton.
  const canTry = !!thumbsFor(g)?.enabled;
  out.push(h('div', { class: 'tk-actions' },
    !helmet && canTry ? h('button', { class: `big-action ${shop.pick === 'try' ? 'primary' : ''}`, onClick: () => { shop.pick = shop.pick === 'try' ? null : 'try'; ui.renderPanel(); } },
      h('span', { class: 'ba-icon' }, shop.trying ? '⏳' : '👀'), h('span', { class: 'ba-text' }, h('b', {}, t('tk_tryOn')))) : null, // (⏳ : la photo se prépare)
    h('button', {
      class: `big-action ${missing ? 'tk-short' : 'primary'}`,
      onClick: () => {
        if (missing) {
          shop.pick = 'money';
          ui.toast(t('tk_missing', { n: missing }));
          return ui.renderPanel();
        }
        const r = g.buyGear(id, size);
        if (r?.ok) {
          if (shop.pick === 'money') shop.pick = null;
          p.tackColors = { ...(p.tackColors ?? {}), [id]: color };
          g.interiors?.refreshTack?.();
        }
        ui.renderPanel();
      },
    }, h('span', { class: 'ba-icon' }, '🛒'), h('span', { class: 'ba-text' },
      h('b', {}, def.sizes && def.sizes.length > 1 ? t('tk_buySize', { size: t(`tk_size_${size}`) }) : t('tk_buy')),
      h('small', {}, sandbox ? t('tk_free') : missing ? t('tk_missing', { n: missing }) : `${price} 🪙`))),
    helmet
      ? h('button', { class: 'big-action', disabled: !own || wearing, onClick: () => { g.equipHelmet(id, color); ui.renderPanel(); } },
        h('span', { class: 'ba-icon' }, '⛑️'), h('span', { class: 'ba-text' }, h('b', {}, wearing ? t('tk_wearing') : t('tk_wear'))))
      : h('button', { class: `big-action ${shop.pick === 'equip' ? 'primary' : ''}`, disabled: !own, onClick: () => { shop.pick = shop.pick === 'equip' ? null : 'equip'; ui.renderPanel(); } },
        h('span', { class: 'ba-icon' }, '✅'), h('span', { class: 'ba-text' }, h('b', {}, t('tk_equip'))))));

  // Pas assez de pièces : combien il manque, et où en gagner.
  if (shop.pick === 'money') {
    out.push(h('div', { class: 'tk-pick' },
      h('b', {}, missing ? t('tk_missing', { n: missing }) : t('tk_buy')),
      h('button', { class: 'primary', onClick: () => { ui.closePanel(); ui.openJobs(); } }, `📋 ${t('tk_earnMoney')}`)));
  }
  // Choisir l'animal (essayage ou équipement).
  if (shop.pick === 'try' || shop.pick === 'equip') {
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
async function tryOn(ui, id, a, color) {
  const g = ui.game;
  const e = g.entities.get(a.id);
  if (!e) return ui.toast(t('tk_tryNobody'));
  const def = GEAR[id];
  const gear = { ...(a.gear ?? {}), [def.slot]: { item: id, color, size: sizeFor(id, a) } };
  // (un tapis se voit aussi seul, sur le dos : pas besoin de lui ajouter une selle)
  shop.pick = null;
  shop.trying = true;
  ui.renderPanel();
  const url = await tryPhoto(g, e, gear, def.slot); // cadré sur l'objet essayé
  shop.trying = false;
  if (url) {
    setTryUrl(url);
    shop.tryName = a.name;
    shop.tryFor = `${id}|${color}`;
  } else ui.toast(t('tk_tryUnavailable')); // (contexte WebGL perdu pendant la photo, vignettes coupées)
  if (ui.panel?.kind === 'tack') {
    ui.renderPanel();
    // La photo est en haut de la fiche : on y remonte (sur un téléphone, on était descendu jusqu'aux boutons).
    if (url) ui.panelBody?.scrollTo?.({ top: 0, behavior: 'smooth' });
  }
  return null;
}

/**
 * D'où l'on regarde l'objet essayé, et la taille minimale du cadre (m, à l'échelle de l'animal). whole : l'animal
 * entier, tête et sabots compris (selle, tapis, couverture, guêtres : on voit l'objet sur SON cheval, de trois
 * quarts côté montoir, à hauteur d'épaule ; avant, le cadre serré sur la selle coupait la tête et les pieds).
 */
const TRY_VIEW = {
  saddle: { dir: [1, 0.36, 0.5], whole: true, grow: 1.04 },
  pad: { dir: [1, 0.36, 0.5], whole: true, grow: 1.04 },
  blanket: { dir: [1, 0.32, 0.58], whole: true, grow: 1.04 },
  bridle: { dir: [1, 0.2, 0.62], grow: 1.55, min: 0.6 },
  halter: { dir: [1, 0.2, 0.62], grow: 1.55, min: 0.6 },
  head: { dir: [1, 0.22, 0.62], grow: 1.5, min: 0.6 },
  legs: { dir: [1, 0.25, 0.7], whole: true, grow: 1.04 },
  bells: { dir: [1, 0.25, 0.7], grow: 1.15, min: 0.7 },
};
const ANIMAL_VIEW = [1, 0.32, 0.62];

/**
 * Photo d'un de nos animaux qui essaie un équipement (moteur des vignettes, même studio) : un double neuf de
 * l'animal (thumbScenes.photoDouble), en pose de photo, porte l'équipement d'essai ; l'animal vivant ne bouge
 * pas (le déplacer dans le studio laissait, en qualité haute, l'équipement flotter sans le cheval).
 */
function tryPhoto(g, e, gear, slot) {
  const th = thumbsFor(g);
  if (!th?.enabled) return Promise.resolve(null);
  return th.capture(() => {
    const d = photoDouble(e);
    const root = d.holder;
    const view = TRY_VIEW[slot];
    const box = new THREE.Box3();
    const add = (list) => {
      root.updateMatrixWorld(true);
      for (const m of list) m.traverse((o) => {
        if (o.isMesh && !o.isSprite && o.material?.depthWrite !== false) box.expandByObject(o);
      });
    };
    if (view && gear[slot]) {
      // Cadrage sur l'objet essayé (selle et tapis vont ensemble), puis tout l'équipement d'essai.
      const pair = slot === 'saddle' && gear.pad ? { pad: gear.pad } : slot === 'pad' && gear.saddle ? { saddle: gear.saddle } : {};
      add(d.wear({ [slot]: gear[slot], ...pair }));
    }
    const all = d.wear(gear);
    if (view?.whole) add([d.model.root, ...all]);
    if (box.isEmpty()) add([d.model.root]); // sans objet à cadrer : l'animal entier
    const k = e.scale ?? 1;
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3()).multiplyScalar(view?.grow ?? 1.05);
    const min = (view?.min ?? 0) * k;
    s.set(Math.max(s.x, min), Math.max(s.y, min), Math.max(s.z, min));
    // Agrandie autour d'objets au ras du sol (guêtres, cloches), la boîte passerait sous le sol : on la remonte.
    const b = new THREE.Box3().setFromCenterAndSize(c, s);
    const up = aboveGround(b.min.toArray(), b.max.toArray(), 0);
    return {
      object: root,
      box: new THREE.Box3(new THREE.Vector3(...up.min), new THREE.Vector3(...up.max)),
      dir: view?.dir ?? ANIMAL_VIEW,
      ground: 0,
      dispose: d.dispose,
    };
  }, { w: 360, h: 250 });
}

function equipOn(ui, id, a, color) {
  const g = ui.game;
  const r = g.equip(a, id, color, { exact: true }); // ce modèle-là, pas un autre du même type
  if (r?.ok) {
    ui.toast(t('tk_equipped', { item: name(r.item), name: a.name }));
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
  // En voyage : ce qui lui irait (à sa taille) mais qui n'est pas dans le coffre.
  const homeOf = (id) => !fitReason(id, a) && !spareOf(id) && atHomeCount(p, id, sizeFor(id, a)) > 0;
  const rows = slots.map((slot) => {
    const worn = a.gear?.[slot];
    const spare = Object.keys(GEAR).filter((id) => GEAR[id].slot === slot && worn?.item !== id && spareOf(id));
    const home = Object.keys(GEAR).filter((id) => GEAR[id].slot === slot && worn?.item !== id && homeOf(id));
    return { slot, worn, spare, home };
  }).filter((r) => r.worn || r.spare.length || r.home.length);
  const firstCat = catOf(Object.keys(GEAR).find(forMe));
  return h('div', { class: 'gear-list' },
    rows.length ? rows.map(({ slot, worn, spare, home }) => h('div', { class: 'gear-row' },
      h('span', { class: 'gear-name' }, h('small', { class: 'tk-slot' }, t(`tk_slot_${slot}`)), ' ',
        worn ? h('b', {}, `${GEAR[worn.item].emoji} ${name(worn.item)}`) : h('span', { class: 'note' }, t('tk_none')),
        worn?.color ? h('span', { class: 'swatch-dot tk-dot', style: { background: hex(worn.color) } }) : null),
      worn ? h('button', { class: 'small', onClick: () => { g.unequip(a, slot); ui.renderPanel(); } }, t('gearRemove')) : null,
      ...spare.slice(0, 3).map((id) => h('button', { class: 'small primary', onClick: () => { g.equip(a, id, colorOf(p, id), { exact: true }); ui.renderPanel(); } }, `${GEAR[id].emoji} ${name(id)}`)),
      // (toucher : le message explique qu'il est resté à la maison, pas dans le coffre)
      ...(spare.length ? [] : home.slice(0, 2)).map((id) => h('button', { class: 'small tk-athome', title: t('gearAtHome'), onClick: () => { g.equip(a, id, colorOf(p, id), { exact: true }); ui.renderPanel(); } },
        `🏠 ${name(id)} · ${t('tk_atHomeRow')}`))))
      : h('p', { class: 'note' }, t('tk_gearNone')),
    h('button', { class: 'small tk-goshop', onClick: () => openTackShop(ui, { tab: firstCat }) }, `🏇 ${t('tk_goShop')}`));
}
