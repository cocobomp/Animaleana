// Menus d'actions qui apparaissent quand on touche un bâtiment ou un animal :
// de gros boutons faciles pour les enfants, avec la raison quand une action est impossible.

import { h } from './dom.js';
import { t, ta } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { canRide } from '../sim/animal.js';
import { canProduce } from '../sim/farm.js';
import { speciesName } from './names.js';
import { CARE, NEEDS, happiness } from '../sim/animal.js';
import { NEED_ICON } from './UI.js';
import { bar } from './dom.js';

const BUILDING_ICON = { stable: '🐴', pen: '🐑', house: '🏠', lodge: '🛏️', refuge: '🐾', vet: '🩺', jobs: '📋' };

function sheet(ui, title, subtitle, items, header = null, live = false) {
  ui.openPanel({
    title,
    kind: 'actions',
    live,
    render: () => [
      subtitle ? h('p', { class: 'note' }, subtitle) : null,
      header ? header() : null,
      h('div', { class: 'action-sheet' }, items().map((it) => h('button', {
        class: `big-action ${it.enabled === false ? 'off' : ''} ${it.primary ? 'primary' : ''}`,
        onClick: () => {
          if (it.enabled === false) {
            ui.toast(it.why);
            return;
          }
          it.run();
        },
      }, h('span', { class: 'ba-icon' }, it.icon), h('span', { class: 'ba-text' }, h('b', {}, it.label),
        it.enabled === false && it.why ? h('small', {}, it.why) : it.effect ? h('small', { class: 'effect' }, it.effect) : null)))),
    ],
  });
}

export function openBuilding(ui, kind) {
  const g = ui.game;
  const home = g.isHome;
  const name = kind === 'refuge' && !home ? t('bld_breeder') : t(`bld_${kind}`);
  const close = () => ui.closePanel();
  const run = {
    checkHorses: () => g.checkHorses(),
    storeHorses: () => { g.sendHorses('paddock'); close(); },
    outHorses: () => { g.sendHorses('field'); close(); },
    hayHorses: () => ui.groupCareWithGame((a) => a.species === 'horse', 'feed'),
    waterHorses: () => ui.groupCareWithGame((a) => a.species === 'horse', 'water'),
    brushHorses: () => ui.groupCareWithGame((a) => a.species === 'horse', 'brush'),
    cleanStalls: () => {
      const n = g.cleanZone('paddock');
      if (n) ui.toast(t('scoopedN', { n }));
      ui.groupCareWithGame((a) => a.species === 'horse', 'clean');
    },
    cleanPen: () => { ui.toast(t('scoopedN', { n: g.cleanZone('pen') })); ui.renderPanel(); },
    outFlock: () => { close(); g.moveFlock('field'); },
    inFlock: () => { close(); g.moveFlock('pen'); },
    hayFlock: () => ui.groupCareWithGame((a) => SPECIES[a.species].livestock, 'feed'),
    waterFlock: () => ui.groupCareWithGame((a) => SPECIES[a.species].livestock, 'water'),
    milkAll: () => g.groupCollect('milk'),
    shearAll: () => g.groupCollect('shear'),
    farm: () => ui.openFarm(),
    tack: () => ui.openTack(),
    sleep: () => { close(); g.sleep(); },
    feedPets: () => ui.groupCareWithGame((a) => ['dog', 'cat', 'rabbit'].includes(a.species), 'feed'),
    avatar: () => { close(); ui.showAvatarEditor(g.profile, () => ui.clearScreen()); },
    adopt: () => ui.openAdoption(),
    vet: () => ui.openVetClinic(),
    jobs: () => ui.openJobs(),
  };
  sheet(ui, `${BUILDING_ICON[kind]} ${name}`, t(`bldd_${kind}`), () => g.buildingActions(kind).map((a) => ({
    icon: a.icon,
    label: t(`do_${a.id}`),
    enabled: a.enabled,
    why: a.reason ? t(`why_${a.reason}`, a.params) : '',
    run: run[a.id],
  })));
}

/** Menu rapide d'un animal touché : les soins les plus courants + « Plus… » pour la fiche complète. */
export function openAnimalActions(ui, a) {
  const g = ui.game;
  const sp = SPECIES[a.species];
  const icons = {
    feed: '🍖', water: '💧', brush: '🪮', wash: '🫧', clean: '🧹', nails: '✂️', shoe: '🔨', pet: '🤚', treat: '🍪', play: '⚽', lunge: '🌀', liberty: '💛',
  };
  const main = ['feed', 'water', 'pet', 'brush', 'play', 'wash', 'clean', 'treat'].filter((x) => sp.actions.includes(x));
  sheet(ui, `${sp.emoji} ${a.name}`, `${speciesName(a)} · ${ta('mood_' + g.moodOf(a), a)}`, () => {
    const items = main.map((x) => {
      const allowed = g.animalActionAllowed(a, x);
      return {
        icon: icons[x],
        label: x === 'clean' ? t(`act_${a.species}_clean`) : t(`act_${x}`),
        enabled: allowed.ok,
        why: allowed.ok ? '' : ta(`why_${allowed.reason}`, a),
        effect: effectText(x),
        run: () => ui.careWithGame(a, x),
      };
    });
    if (sp.product && canProduce(a)) {
      items.push({
        icon: sp.product.id === 'wool' ? '🧶' : '🥛',
        label: t(`act_${sp.product.action}`),
        enabled: !!a.produceReady,
        why: ta('r_notReady', a),
        run: () => ui.collectWithGame(a),
      });
    }
    if (sp.rideable) {
      const r = canRide(a);
      const asleep = g.entities.get(a.id)?.sleeping;
      items.push({
        icon: '🏇',
        label: t('act_ride'),
        enabled: r.ok && !asleep,
        why: asleep ? ta('why_animalAsleep', a) : ta(`r_${r.reason}`, a),
        primary: true,
        run: () => { if (g.ride(a)) ui.closePanel(); },
      });
    }
    items.push({
      icon: a.following ? '✋' : '🦮',
      label: a.following ? t('act_stay') : t('act_follow'),
      run: () => { g.toggleFollow(a); ui.closePanel(); },
    });
    items.push({ icon: '📋', label: t('more'), run: () => ui.openAnimal(a) });
    return items;
  }, () => h('div', { class: 'bars compact' },
    bar(t('happiness'), happiness(a), 'big'),
    NEEDS.map((n) => bar(`${NEED_ICON[n]} ${t(`need_${n}`)}`, a.needs[n]))), true);
}

/** « 🍖 Faim +45 · ❤️ +6 » : ce que remplit chaque soin. */
function effectText(action) {
  return Object.entries(CARE[action]?.needs ?? {})
    .filter(([, v]) => v > 0)
    .map(([n, v]) => `${NEED_ICON[n]} ${t(`need_${n}`)} +${v}`)
    .join(' · ');
}
