// Interface de la vue d'ensemble et de la construction : barre d'outils en bas de l'écran,
// catalogue des constructions, feuille d'actions d'une construction, choix des habitants,
// et la rubrique « Maison » de la fiche d'un animal.

import { h } from './dom.js';
import { t } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { isSandbox, canAfford } from '../sim/profile.js';
import {
  STRUCTURES, CATEGORIES, spaceSummary, canAssign, refundOf, accepts, hasResidents,
} from '../sim/construction.js';
import { buildingActions } from '../sim/buildings.js';
import { actionSheet } from './actions.js';

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
    const def = STRUCTURES[b.type];
    const sandbox = isSandbox(ui.game.profile);
    const price = b.moving || sandbox ? '' : ` · ${def.price} 🪙`;
    const touch = matchMedia('(pointer: coarse)').matches;
    const reason = b.reasonText();
    key = `b|${b.type}|${b.moving?.id}|${b.valid.ok}|${reason}|${b.rot}`;
    content = [
      h('div', { class: `mgmt-info ${b.valid.ok ? 'ok' : 'bad'}` },
        h('b', {}, `${def.emoji} ${structureName(b.type)}${price}`),
        h('small', {}, b.valid.ok ? t(touch ? 'con_hint' : 'con_hintMouse') : `⛔ ${reason}`)),
      h('div', { class: 'mgmt-row' },
        big('⟳', t('con_rotate'), () => b.rotate()),
        big('✅', t(b.moving ? 'con_confirmMove' : 'con_confirm'), () => b.confirm(), `primary ${b.valid.ok ? '' : 'off'}`),
        big('✖', t('cancel'), () => b.cancel())),
    ];
  } else {
    key = `v|${view.leaving}`;
    content = [h('div', { class: 'mgmt-row' },
      big('🔨', t('mgmt_build'), () => openCatalogue(ui), 'primary'),
      big('➖', t('mgmt_zoomOut'), () => view.zoomBy(1.35)),
      big('➕', t('mgmt_zoomIn'), () => view.zoomBy(0.74)),
      big('🧍', t('mgmt_me'), () => view.recenter()),
      big('⬅️', t('mgmt_exit'), () => view.exit()))];
  }
  if (key === view.barKey) return;
  view.barKey = key;
  bar.replaceChildren(...content);
}

// ---------------------------------------------------------------- catalogue

export function openCatalogue(ui) {
  const g = ui.game;
  ui.openPanel({
    title: `🔨 ${t('con_catalogue')}`,
    kind: 'construction',
    render: () => {
      const p = g.profile;
      const sandbox = isSandbox(p);
      const space = spaceSummary(p, p.place);
      const out = [
        h('p', { class: 'note' }, t('con_catalogueHelp')),
        h('div', { class: 'chips' }, [['horse', '🐴'], ['livestock', '🐑'], ['dog', '🐶'], ['rabbit', '🐰']]
          .map(([k, e]) => h('span', { class: 'chip' }, `${e} ${t('con_spaceChip', { used: space[k].used, cap: space[k].cap })}`))),
      ];
      for (const cat of CATEGORIES) {
        const types = Object.keys(STRUCTURES).filter((k) => STRUCTURES[k].cat === cat);
        out.push(h('h3', {}, t(`con_cat_${cat}`)));
        out.push(h('div', { class: 'cards' }, types.map((type) => {
          const def = STRUCTURES[type];
          const check = g.structures.canBuild(type);
          const locked = check.reason === 'locked';
          const info = [
            def.capacity ? `${speciesEmojis(type)} · ${t('con_cap', { n: def.capacity })}` : null,
            t('con_size', { w: def.w, d: def.d }),
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
            h('span', { class: 'card-emoji' }, def.emoji),
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
    conMove: () => {
      close();
      if (!g.mgmt.active) g.mgmt.enter();
      g.mgmt.focus.set(s.x, 0, s.z);
      g.mgmt.build.start(s.type, s.id);
    },
    conDemolish: async () => {
      const refund = isSandbox(g.profile) ? '' : ` ${t('con_refund', { n: refundOf(s.type) })}`;
      if (!(await ui.confirm(`${t('con_confirmDemolish', { name })}${refund}`))) return;
      const r = st.demolish(s.id);
      if (r.ok) {
        close();
        ui.toast(`${t('con_demolished', { name, g: def.g })}${r.refund ? ` ${t('con_refund', { n: r.refund })}` : ''}`, 4000);
        ui.refresh();
      }
    },
  };
  const subtitle = () => {
    const res = st.residents(s);
    const parts = [t(`con_d_${s.type}`)];
    if (hasResidents(s.type)) {
      parts.push(res.length
        ? `${t('con_residents', { names: res.map((a) => a.name).join(', ') })} (${res.length}/${def.capacity})`
        : t('con_nobody'));
    }
    return parts.join(' ');
  };
  const items = () => {
    const ctx = {
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
      label: a.id === 'conResidents' ? `${t('con_do_conResidents')} (${ctx.count.residents}/${def.capacity})` : t(`con_do_${a.id}`),
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
        h('p', { class: 'note' }, `${t('con_residentsHelp')} ${t('con_spaceChip', { used: res.length, cap: def.capacity })}`),
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
    }, `${def.emoji} ${structureName(s.type)} (${n}/${def.capacity})${here ? ' ✅' : ''}`);
  });
  if (home) btns.push(h('button', { class: 'act', onClick: () => { st.unassign(a); ui.toast(t('con_unassigned', { name: a.name })); ui.renderPanel(); } }, `↩️ ${t('con_moveOut')}`));
  if (btns.length) out.push(h('div', { class: 'grid' }, btns));
  else out.push(h('p', { class: 'note' }, t('con_homeHint')));
  return out;
}
