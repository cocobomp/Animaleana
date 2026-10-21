// Gérer les bâtiments : propreté, état, place, qui y vit, réparations et améliorations.
// Et les petits menus des coins de l'écurie et de la maison (box, lit).

import { h, bar } from './dom.js';
import { t, hourParams } from '../i18n.js';
import { sheet } from './actions.js';
import { SPECIES, coreShown } from '../sim/species.js';
import { isSandbox } from '../sim/profile.js';
import {
  ensureFacilities, cleanliness, condition, boxCount, boxOccupants, repairCost, repair, UPGRADES, ROOMS,
  canBuyUpgrade, buyUpgrade, hasUpgrade, stableSlots, STRAW_COST,
} from '../sim/facilities.js';

const ICON = { stable: '🐴', house: '🏠', pen: '🐑' };

/** Qui vit dans ce bâtiment. */
function residents(g, kind) {
  const here = g.animalsHere();
  if (kind === 'stable') return here.filter((a) => a.species === 'horse');
  if (kind === 'house') return here.filter((a) => ['dog', 'cat', 'rabbit'].includes(a.species));
  return here.filter((a) => SPECIES[a.species].livestock);
}

function capacityText(g, kind) {
  const f = ensureFacilities(g.profile);
  const n = residents(g, kind).length;
  if (kind === 'stable') {
    const used = boxOccupants(f, g.interiors.homeHorses()).filter(Boolean).length;
    return t('fac_capBoxes', { n: used, total: boxCount(f), max: stableSlots(f) });
  }
  return t(kind === 'house' ? 'fac_capPets' : 'fac_capFlock', { n });
}

/** Fenêtre « Gérer » d'un bâtiment (écurie, maison, bergerie). */
export function openFacility(ui, kind) {
  const g = ui.game;
  ui.openPanel({
    title: `${ICON[kind]} ${t(`fac_title_${kind}`)}`,
    live: true,
    render: () => {
      const p = g.profile;
      const f = ensureFacilities(p);
      const sandbox = isSandbox(p);
      const out = [];
      out.push(h('div', { class: 'bars fac-main' },
        bar(`✨ ${t('fac_clean')}`, cleanliness(f, kind), 'big'),
        bar(`🔨 ${t('fac_condition')}`, condition(f, kind), 'big')));
      out.push(h('p', { class: 'fac-cap' }, capacityText(g, kind)));

      // Qui vit là
      const who = residents(g, kind);
      const occ = kind === 'stable' ? boxOccupants(f, g.interiors.homeHorses()) : [];
      out.push(h('h3', {}, t('fac_residents')));
      out.push(who.length
        ? h('div', { class: 'chips' }, who.map((a) => {
          const box = occ.indexOf(a);
          const where = kind === 'stable' ? (a.stalled && box >= 0 ? ` · ${t('fac_inBox', { n: box + 1 })}` : ` · ${t('fac_outside')}`) : '';
          return h('span', { class: 'chip' }, `${SPECIES[a.species].emoji} ${a.name}${where}`);
        }))
        : h('p', { class: 'note' }, t('fac_nobody')));

      // Pièces et box
      out.push(h('h3', {}, t('fac_rooms')));
      out.push(h('div', { class: 'bars small' }, ROOMS[kind].map((r) => bar(t(`fac_room_${r}`), f[kind].rooms[r]))));
      if (kind === 'stable') {
        out.push(h('div', { class: 'fac-boxes' }, f.boxes.slice(0, boxCount(f)).map((b, i) => h('button', {
          class: 'fac-box',
          onClick: () => ui.openBox(i),
        }, h('b', {}, `${i + 1}. ${occ[i]?.name ?? t('fac_free')}`),
        h('span', { class: 'mini-track' }, h('span', { class: `mini-fill ${b.clean < 30 ? 'low' : ''}`, style: { width: `${b.clean}%` } })),
        h('small', {}, `🧹 ${Math.round(b.clean)} · 🌾 ${Math.round(b.straw)}`)))));
      }
      out.push(h('p', { class: 'note' }, t(kind === 'pen' ? 'fac_howPen' : 'fac_howInside')));
      const row = [];
      if (kind !== 'pen') row.push(h('button', { class: 'act', onClick: () => { ui.closePanel(); g.interiors.enter(kind); } }, `🚪 ${t('do_facEnter')}`));
      // Réparer
      const wear = f[kind].wear;
      const cost = repairCost(f, kind);
      row.push(h('button', {
        class: 'act primary',
        disabled: wear >= 99,
        onClick: () => {
          const r = repair(p, kind);
          ui.toast(r.ok ? t('fac_repaired') : t(r.reason === 'money' ? 'r_money' : 'fac_r_notNeeded'));
          if (r.ok) { g.xp('build'); g.save(); }
          ui.renderPanel();
          ui.refresh();
        },
      }, wear >= 99 ? `✅ ${t('fac_goodState')}` : `🔨 ${t('fac_repair')}${sandbox ? '' : ` · ${cost} 🪙`}`));
      out.push(h('div', { class: 'grid fac-row' }, row));

      // Améliorations (bergerie sans troupeau possible : seulement celles déjà installées, et le petit mot)
      const idle = !coreShown(p, kind);
      const ups = UPGRADES[kind].filter((u) => !idle || hasUpgrade(f, kind, u.id));
      if (idle) out.push(h('p', { class: 'note more-soon' }, t('moreSoon')));
      if (ups.length) out.push(h('h3', {}, t('fac_upgrades')));
      out.push(h('div', { class: 'cards' }, ups.map((u) => {
        const owned = hasUpgrade(f, kind, u.id);
        const c = canBuyUpgrade(p, kind, u.id);
        let side;
        if (owned) side = h('span', { class: 'card-side' }, '✅');
        else if (c.reason === 'level') side = h('span', { class: 'lock' }, `🔒 ${t('level', { n: u.level })}`);
        else if (c.reason === 'requires') side = h('span', { class: 'lock' }, `🔒 ${t(`fac_up_${kind}_${u.requires}`)}`);
        else {
          side = h('button', {
            class: 'primary',
            onClick: () => {
              const r = buyUpgrade(p, kind, u.id);
              if (!r.ok) return ui.toast(t(r.reason === 'money' ? 'r_money' : 'alreadyOwned'));
              ui.toast(t('fac_bought', { name: t(`fac_up_${kind}_${u.id}`) }));
              g.xp('build');
              g.interiors.refreshVisuals();
              g.save();
              ui.renderPanel();
              ui.refresh();
              return r;
            },
          }, sandbox ? t('install') : `${t('install')} · ${u.price} 🪙`);
        }
        return h('div', { class: `card ${!owned && c.reason === 'level' ? 'locked' : ''}` },
          h('span', { class: 'card-emoji' }, u.icon),
          h('span', { class: 'card-main' }, h('b', {}, t(`fac_up_${kind}_${u.id}`)), h('small', {}, t(`fac_upd_${kind}_${u.id}`))),
          side);
      })));
      return out;
    },
  });
}

/** Onglet « Bâtiments » de la fenêtre 🚜 Ferme. */
export function facilitiesTab(ui) {
  const g = ui.game;
  if (!g.interiors.here) return [h('p', { class: 'note' }, t('fac_awayHome'))];
  const f = ensureFacilities(g.profile);
  return [
    h('p', { class: 'note' }, t('fac_tabHelp')),
    // (la bergerie et ses améliorations : seulement si moutons, chèvres ou vaches sont proposés, ou déjà là)
    h('div', { class: 'cards' }, ['stable', 'house', 'pen'].filter((kind) => coreShown(g.profile, kind)).map((kind) => h('div', { class: 'card' },
      h('span', { class: 'card-emoji' }, ICON[kind]),
      h('span', { class: 'card-main' },
        h('b', {}, t(`fac_title_${kind}`)),
        h('small', {}, `✨ ${cleanliness(f, kind)} % · 🔨 ${condition(f, kind)} % · ${capacityText(g, kind)}`)),
      h('button', { class: 'primary', onClick: () => ui.openFacility(kind) }, t('fac_manageShort'))))),
  ];
}

/** Menu d'un box : curer, paille, foin, eau, mettre un cheval ou le sortir. */
export function openBox(ui, i) {
  const g = ui.game;
  const f = ensureFacilities(g.profile);
  if (i >= boxCount(f)) {
    ui.toast(t('fac_boxLockedHelp'), 5000);
    ui.openFacility('stable');
    return;
  }
  const sandbox = isSandbox(g.profile);
  const occupant = () => boxOccupants(f, g.interiors.homeHorses())[i];
  sheet(ui, `🐴 ${g.interiors.boxLabel(i)}`, t('fac_boxHelp'), () => {
    const box = f.boxes[i];
    const a = occupant();
    const items = [
      {
        icon: '🧹', label: t('fac_do_muck'), enabled: box.clean < 97, why: t('fac_r_alreadyClean'),
        effect: `🧹 ${Math.round(box.clean)} → 100`, run: () => g.interiors.chore('muck', i),
      },
      {
        icon: '🌾', label: t('fac_do_straw'), enabled: box.straw < 97, why: t('fac_r_alreadyClean'),
        effect: `🌾 ${Math.round(box.straw)} → 100${sandbox ? '' : ` · ${STRAW_COST} 🪙`}`, run: () => g.interiors.chore('straw', i),
      },
    ];
    if (a) {
      const here = a.location === g.profile.place;
      items.push({ icon: '🌾', label: t('fac_do_hay', { name: a.name }), enabled: here, why: t('fac_away'), run: () => ui.careWithGame(a, 'feed') });
      items.push({ icon: hasUpgrade(f, 'stable', 'waterers') ? '🚰' : '🪣', label: t('fac_do_bucket'), enabled: here, why: t('fac_away'), run: () => ui.careWithGame(a, 'water') });
      if (a.stalled) items.push({ icon: '🌳', label: t('fac_do_out', { name: a.name }), enabled: here, why: t('fac_away'), run: () => { g.interiors.unstall(a); ui.closePanel(); } });
      else items.push({ icon: '🏠', label: t('fac_do_in', { name: a.name }), primary: true, enabled: here, why: t('fac_away'), run: () => { g.interiors.stall(a, i); ui.closePanel(); } });
    } else {
      // Box libre : on peut y mettre un cheval.
      for (const x of g.animalsHere().filter((b) => b.species === 'horse')) {
        items.push({ icon: '🐴', label: t('fac_do_put', { name: x.name }), run: () => { g.interiors.stall(x, i); ui.closePanel(); } });
      }
    }
    return items;
  }, () => h('div', { class: 'bars compact' },
    bar(`🧹 ${t('fac_boxClean')}`, f.boxes[i].clean),
    bar(`🌾 ${t('fac_boxStraw')}`, f.boxes[i].straw)), true);
}

/** Le lit : dormir, ou faire le lit et ranger la chambre. */
export function openBed(ui) {
  const g = ui.game;
  const f = ensureFacilities(g.profile);
  sheet(ui, `🛏️ ${t('fac_room_bedroom')}`, '', () => {
    const sleep = g.buildingActions('house').find((x) => x.id === 'sleep');
    return [
      { icon: '🛏️', label: t('do_sleep'), primary: true, enabled: sleep.enabled, why: sleep.reason ? t(`why_${sleep.reason}`, hourParams(sleep.params)) : '', run: () => { ui.closePanel(); g.sleep(); } },
      { icon: '🧺', label: t('fac_do_bedroom'), enabled: f.house.rooms.bedroom < 97, why: t('fac_r_alreadyClean'), effect: `✨ ${Math.round(f.house.rooms.bedroom)} → 100`, run: () => g.interiors.chore('bedroom') },
    ];
  }, null, true);
}

/** Dans le menu d'un cheval : « Rentrer au box » ou « Sortir au paddock ». */
export function horseBoxItems(ui, a) {
  const g = ui.game;
  if (a.species !== 'horse' || !g.interiors.here || !g.isHome) return [];
  if (a.stalled) {
    return [{ icon: '🌳', label: t('fac_do_out', { name: a.name }), run: () => { g.interiors.unstall(a); ui.closePanel(); } }];
  }
  return [{ icon: '🏠', label: t('fac_do_in', { name: a.name }), run: () => { g.interiors.stall(a); ui.closePanel(); } }];
}
