// Menus d'actions qui apparaissent quand on touche un bâtiment ou un animal :
// de gros boutons faciles pour les enfants, avec la raison quand une action est impossible.

import { h } from './dom.js';
import { t, ta } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { canRide } from '../sim/animal.js';
import { canProduce } from '../sim/farm.js';
import { canLeash } from '../sim/gear.js';

const canLeashNow = (a) => canLeash(a) || (a.following && a.leashed);
import { speciesName } from './names.js';
import { CARE, NEEDS, happiness } from '../sim/animal.js';
import { NEED_ICON } from './UI.js';
import { bar } from './dom.js';
import { horseBoxItems } from './facilitiesPanel.js';
import { activityRuns } from './activities.js';

const BUILDING_ICON = { petshop: '🛒', tackroom: '🏇', pethouse: '🐾', stable: '🐴', paddock: '🌾', kennel: '🐶', hutch: '🐰', pen: '🐑', house: '🏠', lodge: '🛏️', refuge: '🐾', vet: '🩺', jobs: '📋', showground: '🏆' };

export function sheet(ui, title, subtitle, items, header = null, live = false) {
  ui.openPanel({
    title,
    kind: 'actions',
    live,
    render: () => [
      subtitle ? h('p', { class: 'note' }, subtitle) : null,
      header ? header() : null,
      h('div', { class: 'action-sheet' }, items().map((it) => h('div', { class: 'ba-wrap' }, h('button', {
        class: `big-action ${it.enabled === false ? 'off' : ''} ${it.primary ? 'primary' : ''}`,
        onClick: () => {
          if (it.enabled === false) {
            ui.toast(it.why);
            return;
          }
          if (!it.free && ui.game.blockedByPause()) return;
          it.run();
        },
      }, h('span', { class: 'ba-icon' }, it.icon), h('span', { class: 'ba-text' }, h('b', {}, it.label),
        it.enabled === false && it.why ? h('small', {}, it.why) : it.effect ? h('small', { class: 'effect' }, it.effect) : null)),
      // 📝 : ajouter cette action à « Ma liste de tâches »
      it.queue ? h('button', {
        class: 'ba-queue',
        title: t('addToTasks'),
        'aria-label': t('addToTasks'),
        onClick: (e) => { e.stopPropagation(); ui.game.tasks.add(it.queue); ui.toast(t('addedToTasks', { what: it.queue.label })); },
      }, '📝') : null))),
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
    storeHorses: () => { g.sendHorses('box'); close(); }, // chacun dans son box
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
    leadIn: () => { close(); g.leadFlock('pen'); },
    leadOut: () => { close(); g.leadFlock('field'); },
    hayFlock: () => ui.groupCareWithGame((a) => SPECIES[a.species].livestock, 'feed'),
    waterFlock: () => ui.groupCareWithGame((a) => SPECIES[a.species].livestock, 'water'),
    milkAll: () => g.groupCollect('milk'),
    shearAll: () => g.groupCollect('shear'),
    horsesToPaddock: () => { g.sendHorses('paddock'); close(); },
    hayPaddock: () => ui.groupCareWithGame((a) => a.species === 'horse', 'feed'),
    cleanPaddock: () => { ui.toast(t('scoopedN', { n: g.cleanZone('paddock') })); ui.renderPanel(); },
    feedDogs: () => ui.groupCareWithGame((a) => a.species === 'dog', 'feed'),
    waterDogs: () => ui.groupCareWithGame((a) => a.species === 'dog', 'water'),
    feedRabbits: () => ui.groupCareWithGame((a) => a.species === 'rabbit', 'feed'),
    cleanHutch: () => ui.groupCareWithGame((a) => a.species === 'rabbit', 'clean'),
    farm: () => ui.openFarm(),
    moveCore: () => { close(); g.mgmt.build.moveCore(kind); }, // vue d'ensemble : déplacer cette installation
    tack: () => ui.openTack(),
    cleanTack: () => ui.choreWithGame('tack').then((q) => { if (q !== null) g.cleanTack(); ui.renderPanel(); }),
    // Maison des animaux
    storePets: () => { g.housePets(true); close(); },
    outPets: () => { g.housePets(false); close(); },
    cleanPetHouse: () => ui.choreWithGame('pethouse').then((q) => { if (q !== null) g.cleanPetHouse(); ui.renderPanel(); }),
    sleep: () => { close(); g.sleep(); },
    feedPets: () => ui.groupCareWithGame((a) => ['dog', 'cat', 'rabbit'].includes(a.species), 'feed'),
    avatar: () => { close(); ui.showAvatarEditor(g.profile, () => ui.clearScreen()); },
    adopt: () => ui.openAdoption(),
    shop: () => ui.openShop(),
    vet: () => ui.openVetClinic(),
    jobs: () => ui.openJobs(),
    // Bâtiments à entretenir (src/ui/facilitiesPanel.js)
    facPaddock: () => { g.sendHorses('paddock'); close(); },
    facEnter: () => { close(); g.interiors.enter(kind); },
    facManage: () => ui.openFacility(kind),
    ...activityRuns(ui), // activités : terrain de concours
  };
  // Maison des animaux : qui dort dans quel coin.
  const header = kind === 'pethouse' ? () => petHouseList(g) : null;
  sheet(ui, `${BUILDING_ICON[kind]} ${name}`, t(`bldd_${kind}`), () => g.buildingActions(kind).map((a) => ({
    icon: a.icon,
    label: t(`do_${a.id}`),
    enabled: a.enabled,
    why: a.reason ? t(`why_${a.reason}`, a.params) : '',
    run: run[a.id],
    queue: ['farm', 'tack', 'avatar', 'adopt', 'shop', 'vet', 'jobs', 'sleep'].includes(a.id) ? null : {
      label: `${t(`do_${a.id}`)} (${name})`,
      icon: a.icon,
      target: () => g.buildingSpot(kind),
      radius: 1.5,
      auto: () => run[a.id](),
      manual: () => { ui.openBuilding(kind); },
    },
    free: ['farm', 'tack', 'avatar', 'adopt', 'shop', 'checkHorses'].includes(a.id), // possible même en pause
  })), header, kind === 'pethouse');
}

/** Les coins de la maison des animaux : un panier par chien, chat ou lapin. */
function petHouseList(g) {
  const pets = g.animalsHere().filter((a) => ['dog', 'cat', 'rabbit'].includes(a.species));
  if (!pets.length) return h('p', { class: 'note' }, t('ph_empty'));
  return h('div', { class: 'ph-list' }, pets.map((a, i) => {
    const e = g.entities.get(a.id);
    const where = !a.housed ? t('ph_outside') : e?.inside ? (e.sleeping ? t('ph_sleeping') : t('ph_inside')) : t('ph_coming');
    return h('div', { class: `ph-row ${a.housed ? 'in' : ''}` },
      h('span', { class: 'ph-spot' }, `${i + 1}`),
      h('span', { class: 'ph-emoji' }, SPECIES[a.species].emoji),
      h('b', {}, a.name),
      h('small', {}, where));
  }));
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
        queue: {
          label: `${x === 'clean' ? t(`act_${a.species}_clean`) : t(`act_${x}`)} · ${a.name}`,
          icon: icons[x],
          target: () => g.entities.get(a.id)?.position ?? null,
          radius: 1.8,
          auto: () => g.autoCare(a, x),
          manual: () => ui.careWithGame(a, x),
        },
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
    if (sp.rideable && a.gear?.saddle) {
      const r = canRide(a);
      items.push({
        icon: '🐎',
        label: t('rideBareback'),
        enabled: r.ok,
        why: ta(`r_${r.reason}`, a),
        run: () => { if (g.ride(a, true)) ui.closePanel(); },
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
    if (a.species === 'dog') {
      items.push({
        icon: '🦮',
        label: a.following && a.leashed ? t('leashStop') : t('leashWalk'),
        enabled: canLeashNow(a),
        why: ta('r_needLeash', a),
        primary: !a.following,
        run: () => { g.toggleLeash(a); ui.closePanel(); },
      });
    }
    items.push({
      icon: a.following ? '✋' : '🐾',
      label: a.following ? t('act_stay') : t('act_follow'),
      run: () => { g.toggleFollow(a); ui.closePanel(); },
    });
    items.push(...horseBoxItems(ui, a)); // box à l'écurie
    items.push({ icon: '📋', label: t('more'), free: true, run: () => ui.openAnimal(a) });
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

// Pour les feuilles d'actions des constructions (src/ui/construction.js).
export { sheet as actionSheet };
