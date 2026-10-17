// Interface de la vue d'ensemble et de la construction : barre d'outils en bas de l'écran (vue d'ensemble,
// vue construction avec ses catégories et ses outils Déplacer / Tourner / Agrandir / Vendre),
// catalogue des constructions, feuille d'actions d'une construction, choix des habitants,
// et la rubrique « Maison » de la fiche d'un animal.

import { h } from './dom.js';
import { t, getLang } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { isSandbox, canAfford } from '../sim/profile.js';
import {
  STRUCTURES, CATEGORIES, spaceSummary, canAssign, refundOf, accepts, hasResidents, moveFeeFor, capacityOf, sizeOf,
} from '../sim/construction.js';
import { localSize, canResize } from '../sim/resize.js';
import { buildingActions } from '../sim/buildings.js';
import { EQUIPMENT } from '../sim/farm.js';
import { actionSheet } from './actions.js';
import { thumb } from '../game/thumbScenes.js'; // vignettes 3D du catalogue

/** Catégories de la vue construction → catégories du catalogue. */
export const BUILD_TABS = [
  { id: 'enclosure', icon: '🐴', cats: ['enclosure', 'ranch'] },
  { id: 'building', icon: '🏚️', cats: ['building'] },
  { id: 'home', icon: '🐶', cats: ['home'] },
  { id: 'equipment', icon: '🥣', cats: [] },
  { id: 'decor', icon: '🌷', cats: ['decor'] },
];

/** Nom d'une construction (les décorations ont leurs propres noms). */
export const structureName = (type) => (STRUCTURES[type].cat === 'decor' ? t(`con_n_${type}`) : t(`st_${type}`));

const has = (key) => t(key) !== key;
const why = (reason, params) => (has(`con_why_${reason}`) ? t(`con_why_${reason}`, params) : t(`why_${reason}`, params));
const speciesEmojis = (type) => [...new Set((STRUCTURES[type].species ?? []).map((s) => SPECIES[s]?.emoji).filter(Boolean))].join(' ');

// ---------------------------------------------------------------- barre d'outils

/** Barre du bas de la vue d'ensemble (redessinée seulement si quelque chose change). */
export function renderBar(ui, view) {
  const bar = view.bar;
  if (!bar) return;
  const b = view.build;
  const big = (icon, label, fn, cls = '') => h('button', { class: `mgmt-btn ${cls}`, onClick: fn, title: label }, h('span', { class: 'mb-icon' }, icon), h('span', { class: 'mb-label' }, label));
  let key;
  let content;
  if (b.active) {
    const sp = b.spec;
    const touch = matchMedia('(pointer: coarse)').matches;
    const reason = b.reasonText();
    const title = `${sp.moving ? '↔️ ' : ''}${sp.emoji} ${sp.name}${b.priceText()}`;
    key = `b|${title}|${b.valid.ok}|${reason}|${b.rot}`;
    content = [
      h('div', { class: `mgmt-info ${b.valid.ok ? 'ok' : 'bad'}` },
        h('b', {}, title),
        h('small', {}, b.valid.ok ? t(touch ? 'con_hint' : 'con_hintMouse') : `⛔ ${reason}`)),
      h('div', { class: 'mgmt-row' },
        sp.rotatable ? big('⟳', t('con_rotate'), () => b.rotate()) : null,
        big('✅', t(sp.moving ? 'con_confirmMove' : 'con_confirm'), () => b.confirm(), `primary ${b.valid.ok ? '' : 'off'}`),
        big('✖', t('cancel'), () => b.cancel())),
    ];
  } else if (view.construct?.active) {
    ({ key, content } = constructBar(ui, view.construct, big));
  } else {
    key = `v|${view.leaving}`;
    content = [h('div', { class: 'mgmt-row' },
      big('🏗️', t('mgmt_build'), () => view.openBuild(), 'primary'),
      big('➖', t('mgmt_zoomOut'), () => view.zoomBy(1.35)),
      big('➕', t('mgmt_zoomIn'), () => view.zoomBy(0.74)),
      big('🧍', t('mgmt_me'), () => view.recenter()),
      big('⬅️', t('mgmt_exit'), () => view.exit()))];
  }
  bar.classList.toggle('construct', !!view.construct?.active && !b.active);
  if (key === view.barKey) return;
  view.barKey = key;
  bar.replaceChildren(...content);
}

const fmtM = (v) => (getLang() === 'fr' ? String(Math.round(v * 10) / 10).replace('.', ',') : String(Math.round(v * 10) / 10));

/**
 * Barre de la vue construction : rien de choisi → catégories, argent et « Terminé » ;
 * un élément choisi → ses outils ; une nouvelle taille proposée → ✅ Valider / Annuler.
 */
function constructBar(ui, cv, big) {
  const g = ui.game;
  const p = g.profile;
  const money = isSandbox(p) ? '∞' : p.money;
  const head = (title, sub, cls = '') => h('div', { class: `mgmt-info ${cls}` },
    h('b', {}, title), sub ? h('small', {}, sub) : null);
  const coin = h('span', { class: 'cv-money' }, `🪙 ${money}`);
  const inf = cv.info();
  if (cv.pending && inf) {
    const r = cv.pending;
    const ok = cv.check.ok;
    const from = t('con_size', { w: fmtM(inf.rect.hw * 2), d: fmtM(inf.rect.hd * 2) });
    const to = t('con_size', { w: fmtM(r.hw * 2), d: fmtM(r.hd * 2) });
    const { w, d } = localSize(r, inf.rot);
    const cap = cv.capacity(inf, w, d);
    const sub = ok ? [cv.costText(), cap ? `${inf.placeEmoji} ${t('cv_places', { n: cap })}` : ''].filter(Boolean).join(' · ') : `⛔ ${cv.reasonText(cv.check)}`;
    const dragging = !!cv.drag;
    return {
      key: `cp|${from}|${to}|${ok}|${sub}|${dragging}|${money}`,
      content: [
        h('div', { class: 'cv-head' }, head(`${inf.emoji} ${inf.name} : ${from} → ${to}`, sub, ok ? 'ok' : 'bad'), coin),
        h('div', { class: 'mgmt-row' },
          big('✅', t('cv_apply'), () => cv.applyPending(), `primary ${ok && !dragging ? '' : 'off'}`),
          big('↩️', t('cancel'), () => cv.cancelPending())),
      ],
    };
  }
  if (inf) {
    const parts = [];
    if (inf.stable) {
      parts.push(t('cv_stableBoxes', { n: inf.boxes }));
    } else if (inf.resizable) {
      parts.push(t('con_size', { w: fmtM(inf.rect.hw * 2), d: fmtM(inf.rect.hd * 2) }));
      const cap = cv.currentCapacity(inf);
      if (cap) parts.push(`${inf.placeEmoji} ${t('cv_places', { n: cap })}`);
    }
    const hint = inf.stable ? t('cv_stableHint') : inf.resizable ? t('cv_resizeHint') : inf.movable ? t('cv_moveHint') : '';
    const tools = [];
    if (inf.movable) tools.push(big('↔️', t('con_do_conMove'), () => cv.move()));
    if (inf.rotatable) tools.push(big('⟳', t('con_rotate'), () => cv.rotate()));
    if (inf.resizable) tools.push(big('⤢', t('cv_resize'), () => cv.hintResize(), 'primary'));
    if (inf.stable) {
      const offer = cv.stableOffer();
      const label = offer.reason === 'max' ? t('cv_stableFull') : `${t('cv_stableExtend')}${offer.ok && offer.price && !isSandbox(p) ? ` · ${offer.price} 🪙` : ''}`;
      tools.push(big('➕', label, () => cv.extendStable(), `primary ${offer.ok ? '' : 'off'}`));
    }
    if (inf.sellable) tools.push(big('💰', t('cv_sell'), () => cv.sell()));
    tools.push(big('✖', t('close'), () => cv.deselect()));
    return {
      key: `cs|${cv.sel.kind}|${cv.sel.id}|${parts.join()}|${money}|${tools.length}|${inf.ext ?? ''}`,
      content: [
        h('div', { class: 'cv-head' }, head(`${inf.emoji} ${inf.name}${parts.length ? ` · ${parts.join(' · ')}` : ''}`, hint), coin),
        h('div', { class: 'mgmt-row' }, ...tools),
      ],
    };
  }
  return {
    key: `c0|${money}`,
    content: [
      h('div', { class: 'cv-head' }, head(`🏗️ ${t('cv_title')}`, t('cv_hint')), coin),
      h('div', { class: 'mgmt-row cv-tabs' }, ...BUILD_TABS.map((tab) => big(tab.icon, t(`cv_cat_${tab.id}`), () => openCatalogue(ui, tab.id)))),
      h('div', { class: 'mgmt-row' },
        big('➖', t('mgmt_zoomOut'), () => cv.view.zoomBy(1.35)),
        big('➕', t('mgmt_zoomIn'), () => cv.view.zoomBy(0.74)),
        big('✅', t('done'), () => cv.done(), 'primary')),
    ],
  };
}

/** Démolir (vendre) une construction, après confirmation. Renvoie vrai si c'est fait. */
export async function confirmDemolish(ui, s) {
  const g = ui.game;
  const def = STRUCTURES[s.type];
  const name = structureName(s.type);
  const refund = isSandbox(g.profile) ? '' : ` ${t('con_refund', { n: refundOf(s.type, sizeOf(s)) })}`;
  if (!(await ui.confirm(`${t('con_confirmDemolish', { name })}${refund}`))) return false;
  const r = g.structures.demolish(s.id);
  if (!r.ok) return false;
  ui.toast(`${t('con_demolished', { name, g: def.g })}${r.refund ? ` ${t('con_refund', { n: r.refund })}` : ''}`, 4000);
  ui.refresh();
  return true;
}

// ---------------------------------------------------------------- catalogue

/**
 * Catalogue des constructions. tab : une catégorie de la vue construction (BUILD_TABS), sinon tout.
 * Choisir un élément le fait apparaître en fantôme sur le terrain (BuildMode).
 */
export function openCatalogue(ui, tab = null) {
  const g = ui.game;
  const only = BUILD_TABS.find((x) => x.id === tab) ?? null;
  ui.openPanel({
    title: only ? `${only.icon} ${t(`cv_cat_${only.id}`)}` : `🔨 ${t('con_catalogue')}`,
    kind: 'construction',
    render: () => {
      const p = g.profile;
      const sandbox = isSandbox(p);
      const space = spaceSummary(p, p.place);
      const out = [
        h('p', { class: 'note' }, t(only?.id === 'equipment' ? 'cv_equipmentHelp' : 'con_catalogueHelp')),
        h('div', { class: 'chips' }, [['horse', '🐴'], ['livestock', '🐑'], ['dog', '🐶'], ['rabbit', '🐰']]
          .map(([k, e]) => h('span', { class: 'chip' }, `${e} ${t('con_spaceChip', { used: space[k].used, cap: space[k].cap })}`))),
      ];
      // Équipements de la ferme (mangeoires, abreuvoirs…) : on choisit où les poser.
      const eqTypes = !only || only.id === 'equipment' ? Object.keys(EQUIPMENT).filter((type) => !g.equipment.some((q) => q.eq.type === type)) : [];
      if (only?.id === 'equipment' && !eqTypes.length) out.push(h('p', { class: 'note' }, t('cv_allEquipment')));
      if (eqTypes.length) {
        out.push(h('h3', {}, t('mgmt_cat_equipment')));
        out.push(h('div', { class: 'cards' }, eqTypes.map((type) => {
          const def = EQUIPMENT[type];
          const locked = !g.isUnlocked(type);
          const who = def.serves.map((sid) => SPECIES[sid].emoji).join(' ');
          const side = locked
            ? h('span', { class: 'lock' }, `🔒 ${t('level', { n: g.unlockLevel(type) })}`)
            : h('button', {
              class: `primary con-place ${canAfford(p, def.price) ? '' : 'off'}`,
              onClick: () => {
                if (!canAfford(p, def.price)) return ui.toast(t('r_money'));
                ui.closePanel();
                g.mgmt.build.newEquipment(type);
                return null;
              },
            }, sandbox ? t('con_place') : `${t('con_place')} · ${def.price} 🪙`);
          return h('div', { class: `card ${locked ? 'locked' : ''}` },
            thumb(g, { kind: 'equipment', type }, { w: 92, h: 69, emoji: def.emoji, cls: 'con-thumb', alt: '' }),
            h('span', { class: 'card-main' }, h('b', {}, t(`eq_${type}`)), h('small', {}, `${who} · ${t(`eqd_${type}`)}`)),
            side);
        })));
      }
      for (const cat of only ? only.cats : CATEGORIES) {
        const types = Object.keys(STRUCTURES).filter((k) => STRUCTURES[k].cat === cat);
        out.push(h('h3', {}, t(`con_cat_${cat}`)));
        out.push(h('div', { class: 'cards' }, types.map((type) => {
          const def = STRUCTURES[type];
          const check = g.structures.canBuild(type);
          const locked = check.reason === 'locked';
          const info = [
            def.capacity ? `${speciesEmojis(type)} · ${t('con_cap', { n: def.capacity })}` : null,
            t('con_size', { w: def.w, d: def.d }) + (canResize(type) ? ` · ${t('cv_growable')}` : ''),
          ].filter(Boolean).join(' · ');
          const side = locked
            ? h('span', { class: 'lock' }, `🔒 ${t('level', { n: check.level })}`)
            : h('button', {
              class: `primary con-place ${canAfford(p, def.price) ? '' : 'off'}`,
              onClick: () => {
                if (!canAfford(p, def.price)) return ui.toast(t('r_money'));
                ui.closePanel();
                g.mgmt.build.start(type);
                return null;
              },
            }, sandbox ? t('con_place') : `${t('con_place')} · ${def.price} 🪙`);
          return h('div', { class: `card ${locked ? 'locked' : ''}` },
            thumb(g, { kind: 'structure', type }, { w: 92, h: 69, emoji: def.emoji, cls: 'con-thumb', alt: '' }),
            h('span', { class: 'card-main' }, h('b', {}, structureName(type)), h('small', {}, t(`con_d_${type}`)), h('small', {}, info)),
            side);
        })));
      }
      return out;
    },
  });
}

// ---------------------------------------------------------------- feuille d'actions

/** Ce qu'on peut faire avec une construction : soigner ses habitants, ramasser, déplacer, démolir… */
export function openStructure(ui, s) {
  const g = ui.game;
  const st = g.structures;
  const def = STRUCTURES[s.type];
  const name = structureName(s.type);
  const kind = def.arena ? 'con_arena' : `con_${def.cat}`;
  const mine = (a) => a.homeId === s.id && a.location === g.profile.place;
  const close = () => ui.closePanel();
  const run = {
    conFeed: () => ui.groupCareWithGame(mine, 'feed'),
    conWater: () => ui.groupCareWithGame(mine, 'water'),
    conBrush: () => ui.groupCareWithGame(mine, 'brush'),
    conPet: () => ui.groupCareWithGame(mine, 'pet'),
    conClean: () => { ui.toast(t('scoopedN', { n: st.clean(s) })); ui.renderPanel(); },
    conCallHome: () => { ui.toast(t('con_called', { n: st.callHome(s) })); },
    conResidents: () => openResidents(ui, s),
    conTrain: () => { const n = st.trainHorses(s); ui.toast(n ? t('con_trained', { n }) : t('nobody')); },
    // Agrandir : la vue construction, avec cet enclos déjà choisi (il reste à tirer ses poignées).
    conResize: () => {
      close();
      g.mgmt.openBuild();
      g.mgmt.construct.select({ kind: 'structure', id: s.id });
    },
    conMove: () => {
      close();
      g.mgmt.build.start(s.type, s.id);
    },
    conDemolish: async () => {
      if (await confirmDemolish(ui, s)) close();
    },
  };
  const subtitle = () => {
    const res = st.residents(s);
    const parts = [t(`con_d_${s.type}`)];
    if (hasResidents(s.type)) {
      parts.push(res.length
        ? `${t('con_residents', { names: res.map((a) => a.name).join(', ') })} (${res.length}/${capacityOf(s)})`
        : t('con_nobody'));
    }
    return parts.join(' ');
  };
  const items = () => {
    const ctx = {
      resizable: canResize(s.type),
      hour: g.hour,
      season: g.season,
      count: {
        residents: st.residents(s).length,
        droppings: st.droppings(s),
        horse: g.animalsHere().filter((a) => a.species === 'horse').length,
      },
    };
    return buildingActions(kind, ctx).map((a) => ({
      icon: a.icon,
      label: a.id === 'conResidents' ? `${t('con_do_conResidents')} (${ctx.count.residents}/${capacityOf(s)})`
        : a.id === 'conMove' && !isSandbox(g.profile) ? `${t('con_do_conMove')} · ${moveFeeFor('structure', s.type)} 🪙` : t(`con_do_${a.id}`),
      enabled: a.enabled,
      why: a.reason ? why(a.reason, a.params) : '',
      primary: a.id === 'conResidents' && ctx.count.residents === 0,
      run: run[a.id],
    }));
  };
  // Le sous-titre change avec les habitants : on le redessine avec la feuille.
  actionSheet(ui, `${def.emoji} ${name}`, null, items, () => h('p', { class: 'note' }, subtitle()), true);
}

/** Choisir qui habite ici. */
export function openResidents(ui, s) {
  const g = ui.game;
  const st = g.structures;
  const def = STRUCTURES[s.type];
  ui.openPanel({
    title: `${def.emoji} ${structureName(s.type)} · 🐾`,
    live: true,
    render: () => {
      const res = st.residents(s);
      const list = g.animalsHere().filter((a) => accepts(s.type, a.species));
      const out = [
        h('p', { class: 'note' }, `${t('con_residentsHelp')} ${t('con_spaceChip', { used: res.length, cap: capacityOf(s) })}`),
        h('button', { class: 'small', onClick: () => openStructure(ui, s) }, `⬅️ ${t('con_back')}`),
      ];
      if (!list.length) out.push(h('p', {}, t('con_noneFits', { who: speciesEmojis(s.type) })));
      out.push(h('div', { class: 'cards' }, list.map((a) => {
        const home = st.homeOf(a);
        const here = a.homeId === s.id;
        const check = canAssign(g.profile, a, s);
        const btn = here
          ? h('button', { onClick: () => { st.unassign(a); ui.toast(t('con_unassigned', { name: a.name })); ui.renderPanel(); } }, t('con_remove'))
          : h('button', {
            class: `primary ${check.ok ? '' : 'off'}`,
            onClick: () => {
              const r = st.assign(a, s);
              if (!r.ok) return ui.toast(t(`con_r_${r.reason}`, { name: structureName(s.type), g: def.g }));
              ui.toast(t('con_assigned', { name: a.name, home: structureName(s.type) }));
              ui.renderPanel();
              return null;
            },
          }, t('con_moveInShort'));
        return h('div', { class: `card ${here ? 'selected' : ''}` },
          h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji),
          h('span', { class: 'card-main' }, h('b', {}, a.name),
            h('small', {}, home ? t('con_homeIs', { home: structureName(home.type) }) : t('con_homeNone'))),
          btn);
      })));
      return out;
    },
  });
}

// ---------------------------------------------------------------- fiche de l'animal

/** Rubrique « 🏠 Maison » de la fiche d'un animal (src/ui/panels.js). */
export function homeSection(ui, a) {
  const g = ui.game;
  const st = g.structures;
  if (!st || a.location !== g.profile.place) return [];
  const home = st.homeOf(a);
  const options = st.here().filter((s) => accepts(s.type, a.species));
  const out = [h('h3', {}, `🏠 ${t('con_homeTitle')}`),
    h('p', { class: 'note' }, home ? t('con_homeIs', { home: structureName(home.type) }) : t('con_homeNone'))];
  const btns = options.map((s) => {
    const def = STRUCTURES[s.type];
    const here = a.homeId === s.id;
    const check = canAssign(g.profile, a, s);
    const n = st.residents(s).length;
    return h('button', {
      class: `act ${here ? 'done' : ''}`,
      disabled: !here && !check.ok,
      onClick: () => {
        if (here) return;
        const r = st.assign(a, s);
        if (!r.ok) return ui.toast(t(`con_r_${r.reason}`, { name: structureName(s.type), g: def.g }));
        ui.toast(t('con_assigned', { name: a.name, home: structureName(s.type) }));
        ui.renderPanel();
      },
    }, `${def.emoji} ${structureName(s.type)} (${n}/${capacityOf(s)})${here ? ' ✅' : ''}`);
  });
  if (home) btns.push(h('button', { class: 'act', onClick: () => { st.unassign(a); ui.toast(t('con_unassigned', { name: a.name })); ui.renderPanel(); } }, `↩️ ${t('con_moveOut')}`));
  if (btns.length) out.push(h('div', { class: 'grid' }, btns));
  else out.push(h('p', { class: 'note' }, t('con_homeHint')));
  return out;
}

// ---------------------------------------------------------------- équipements

/** Un équipement touché dans la vue d'ensemble : le déplacer ou le remplir. */
export function openEquipment(ui, entry) {
  const g = ui.game;
  const type = entry.eq.type;
  const def = EQUIPMENT[type];
  const sandbox = isSandbox(g.profile);
  const fee = sandbox ? '' : ` · ${moveFeeFor('equipment')} 🪙`;
  actionSheet(ui, `${def.emoji} ${t(`eq_${type}`)}`, t(`eqd_${type}`), () => {
    const items = [{
      icon: '↔️',
      label: `${t('con_do_conMove')}${fee}`,
      primary: true,
      run: () => { ui.closePanel(); g.mgmt.build.moveEquipment(entry); },
    }];
    if (def.stock !== null && !sandbox) {
      items.push({
        icon: '🔄',
        label: `${t('refill')} · ${def.refill} 🪙`,
        enabled: entry.eq.stock < def.stock,
        why: t('alreadyFull'),
        run: () => { g.refillEquipment(entry.eq); ui.renderPanel(); },
      });
    }
    return items;
  }, null, true);
}
