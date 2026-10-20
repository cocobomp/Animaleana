// Page « Choisis ton chat et ton lapin » (chats-lapins.html) : deux onglets, Chats et Lapins. Dans chacun,
// une carte par rendu (l'animal actuel du jeu et les modèles GLB candidats), avec les mêmes réglages pour
// toutes : allure ou position, robe, race. Toucher une carte l'ouvre en plein écran, où on fait tourner
// l'animal du doigt (et on zoome en pinçant). Même décor et même lumière que le jeu (petStage.js).
// Un seul moteur de rendu dessine les cartes visibles ; les autres ne sont ni animées ni dessinées.
// Pour les captures automatiques : chats-lapins.html?capture=1 fige l'horloge (window.cmp.advance, cmp.sheet).

import * as THREE from 'three';
import './chatsLapins.css';
import { PetStage, CAMERA_AZIMUTH } from './petStage.js';
import { CANDIDATES, GAITS, COATS, BREEDS, ORIGIN_BREED, ORIGIN_GAME_BREED, FRAME } from './petCandidates.js';
import { ProcPet } from './procPet.js';
import { loadGlbPet } from './glbPet.js';
import { getBreed } from '../sim/species.js';

const SPECIES = ['cat', 'rabbit'];
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
const SPIN = 0.22; // rad/s : l'animal tourne lentement sur lui-même
const START_YAW = CAMERA_AZIMUTH - 0.75; // de trois quarts face à la caméra
const ORIGIN = { id: 'origine', label: 'D’origine' };
const GAIT_NAMES = {
  cat: { stop: 'arrêt', walk: 'pas', run: 'course', sit: 'assis', lie: 'couché', curl: 'en boule', groom: 'toilette' },
  rabbit: { stop: 'arrêt', hop: 'sautille', run: 'course', sit: 'assis', stand: 'debout', lie: 'couché', groom: 'toilette' },
};
const FAV_KEY = { cat: 'animaleana.chatPrefere', rabbit: 'animaleana.lapinPrefere' };

/** Lien vers le texte de la licence (obligatoire pour les modèles CC-BY : auteur, source, licence). */
function licenseLink(license) {
  const url = /CC-BY 4/.test(license) ? 'https://creativecommons.org/licenses/by/4.0/deed.fr'
    : /CC0/.test(license) ? 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr' : null;
  return url ? [' · ', h('a', { href: url, target: '_blank', rel: 'noopener' }, 'texte de la licence')] : null;
}

const store = {
  get(k, d) {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* stockage indisponible : le choix n'est pas gardé */
    }
  },
};

// Réglages de chaque espèce (allure, robe, race) et onglet ouvert.
const startSpecies = params.get('sp') === 'rabbit' || store.get('animaleana.chatsLapinsOnglet', 'cat') === 'rabbit' ? 'rabbit' : 'cat';
const state = {
  species: params.get('sp') === 'cat' ? 'cat' : startSpecies,
  cat: { gait: 'stop', coat: 'origine', breed: 'origine' },
  rabbit: { gait: 'stop', coat: 'origine', breed: 'origine' },
  fav: { cat: store.get(FAV_KEY.cat, null), rabbit: store.get(FAV_KEY.rabbit, null) },
};
for (const k of ['gait', 'coat', 'breed']) if (params.get(k)) state[state.species][k] = params.get(k);
const S = () => state[state.species];

const coatOf = (sp, id) => COATS[sp].find((c) => c.id === id) ?? null;
const breedsOf = (sp) => [...BREEDS[sp], ORIGIN_BREED];
const breedOf = (sp, id) => breedsOf(sp).find((b) => b.id === id) ?? ORIGIN_BREED;
const gameBreed = (sp, id) => (id === 'origine' ? ORIGIN_GAME_BREED[sp] : id);
const gaitOf = (sp, id) => GAITS[sp].find((g) => g.id === id) ?? GAITS[sp][0];
for (const sp of SPECIES) {
  const st = state[sp];
  if (!GAITS[sp].some((g) => g.id === st.gait)) st.gait = 'stop';
  if (!coatOf(sp, st.coat)) st.coat = 'origine';
  if (!breedsOf(sp).some((b) => b.id === st.breed)) st.breed = 'origine';
}

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined) el.append(c);
  return el;
};
const fmtInt = (n) => Math.round(n).toLocaleString('fr-FR');
const fmtBytes = (b) => (b >= 1e6 ? `${(b / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} Mo` : `${fmtInt(b / 1024)} Ko`);
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

// ------------------------------------------------------------------ réglages (en haut et en plein écran)

/** Pastille de couleur d'une robe. */
function swatch(c) {
  if (c.id === 'origine') return h('span', { class: 'sw', style: 'background: conic-gradient(#8c8780 0 33%, #d8873e 0 66%, #f2eee6 0)' });
  let bg = hex(c.base);
  const t = hex(c.tan ?? c.base);
  const w = hex(c.white ?? 0xf2eee6);
  if (c.pattern === 'tabby') bg = `repeating-linear-gradient(100deg, ${hex(c.base)} 0 3px, ${t} 3px 5px)`;
  else if (c.pattern === 'tricolor') bg = `conic-gradient(${t} 0 35%, ${hex(c.base)} 0 65%, ${w} 0)`;
  else if (c.pattern === 'points') bg = `radial-gradient(circle at 50% 45%, ${w} 0 45%, ${hex(c.base)} 75%)`;
  else if (c.pattern === 'rosettes') bg = `radial-gradient(circle at 30% 35%, ${t} 0 2px, transparent 2.5px), radial-gradient(circle at 70% 65%, ${t} 0 2px, transparent 2.5px), ${hex(c.base)}`;
  else if (c.pattern === 'agouti') bg = `radial-gradient(circle at 50% 70%, ${w} 0 25%, transparent 45%), ${hex(c.base)}`;
  else if (c.pattern === 'pie') bg = `radial-gradient(circle at 35% 40%, ${hex(c.base)} 0 3px, transparent 3.5px), radial-gradient(circle at 70% 62%, ${hex(c.base)} 0 2.5px, transparent 3px), ${w}`;
  return h('span', { class: 'sw', style: `background: ${bg}` });
}

const controlRoots = [document.getElementById('chips'), document.getElementById('fs-controls')];

function buildControls() {
  const sp = state.species;
  for (const root of controlRoots) {
    const group = (label, kind, items, sw = null) => h('div', { class: 'group', role: 'group', 'aria-label': label },
      h('span', { class: 'label' }, label),
      h('div', { class: 'chips' }, items.map((it) => h('button', {
        type: 'button', class: 'chip', 'data-kind': kind, 'data-id': it.id, onClick: () => choose(kind, it.id),
      }, sw ? sw(it) : null, it.label))));
    root.replaceChildren(
      group('Allure', 'gait', GAITS[sp]),
      group('Robe', 'coat', [...COATS[sp], ORIGIN], swatch),
      group('Race', 'breed', breedsOf(sp)),
    );
    // Rangées trop longues pour l'écran : le bord s'estompe du côté où il reste des choix.
    for (const row of root.querySelectorAll('.chips')) {
      const edges = () => {
        row.classList.toggle('more-l', row.scrollLeft > 2);
        row.classList.toggle('more-r', row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
      };
      row.addEventListener('scroll', edges, { passive: true });
      new ResizeObserver(edges).observe(row);
    }
  }
  refreshControls();
}
window.addEventListener('resize', () => {
  for (const row of document.querySelectorAll('.chips')) {
    row.classList.toggle('more-l', row.scrollLeft > 2);
    row.classList.toggle('more-r', row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
  }
});

function refreshControls() {
  const st = S();
  for (const root of controlRoots) {
    for (const b of root.querySelectorAll('.chip')) b.setAttribute('aria-pressed', String(st[b.dataset.kind] === b.dataset.id));
  }
}

function choose(kind, id) {
  const st = S();
  if (st[kind] === id) return;
  st[kind] = id;
  refreshControls();
  if (kind === 'coat' || kind === 'breed') applyLook(state.species);
}

// ------------------------------------------------------------------ onglets

const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
function showSpecies(sp, focus = false) {
  if (fs.card) closeFull();
  state.species = sp;
  store.set('animaleana.chatsLapinsOnglet', sp);
  for (const t of tabs) {
    const on = t.dataset.species === sp;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  }
  const list = document.getElementById('cards');
  list.setAttribute('aria-labelledby', `tab-${sp}`);
  for (const c of cards) c.el.hidden = c.species !== sp;
  buildControls();
  ensureLoaded(sp);
  // Déjà descendu dans les cartes : on remonte à la première (l'animal du jeu), sous la barre des réglages.
  const bar = document.getElementById('controls').getBoundingClientRect();
  const top = list.getBoundingClientRect().top;
  if (top < bar.bottom) window.scrollTo({ top: window.scrollY + top - bar.height - 8 });
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => showSpecies(t.dataset.species));
  t.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    showSpecies(tabs[(i + 1) % tabs.length].dataset.species, true);
  });
});

// ------------------------------------------------------------------ cartes

const stage = new PetStage(document.getElementById('stage'));
const cards = SPECIES.flatMap((sp) => CANDIDATES[sp].map((cand) => makeCard(cand, sp)));

function makeCard(cand, species) {
  const loading = h('span', { class: 'loading' }, 'Chargement…');
  const badge = h('span', { class: 'badge', hidden: true });
  const view = h('div', { class: 'view', role: 'button', tabindex: '0', 'aria-label': `Voir en grand : ${cand.name}` },
    loading, badge, h('span', { class: 'grow', 'aria-hidden': 'true' }, '⤢'));
  const tris = h('li', {}, '… triangles');
  const weight = h('li', {}, cand.kind === 'proc' ? 'aucun fichier : calculé' : '…');
  const fav = h('button', { type: 'button', class: 'fav', 'aria-pressed': 'false' }, '♡ Mon préféré');
  const el = h('article', { class: 'card', 'data-id': cand.id, hidden: species !== state.species },
    view,
    h('div', { class: 'info' },
      h('h2', {}, cand.name),
      h('p', { class: 'style' }, cand.style),
      h('ul', { class: 'facts' }, tris, weight, h('li', {}, cand.license, licenseLink(cand.license))),
      h('p', { class: 'meta' }, h('b', {}, 'Auteur : '), cand.author),
      h('p', { class: 'meta' }, h('b', {}, 'Animations : '), cand.anim),
      cand.links.length ? h('p', { class: 'meta' }, h('b', {}, 'Source : '),
        cand.links.flatMap(([label, url], i) => [i ? ' · ' : null, h('a', { href: url, target: '_blank', rel: 'noopener' }, label)])) : null,
      cand.warn ? h('p', { class: 'warn' }, '⚠️ ', cand.warn) : null,
      fav));
  document.getElementById('cards').append(el);
  const card = { cand, species, el, view, loading, badge, tris, weight, fav, pet: null, yaw: START_YAW, pitch: 0, zoom: 1, scroll: { x: 0, z: 0 }, hold: 0 };
  view.addEventListener('click', () => openFull(card));
  view.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFull(card);
    }
  });
  fav.addEventListener('click', () => {
    state.fav[species] = state.fav[species] === cand.id ? null : cand.id;
    store.set(FAV_KEY[species], state.fav[species]);
    refreshFav();
  });
  return card;
}

function refreshFav() {
  for (const c of cards) {
    const on = state.fav[c.species] === c.cand.id;
    c.el.classList.toggle('fav-on', on);
    c.fav.setAttribute('aria-pressed', String(on));
    c.fav.textContent = on ? '♥ Mon préféré' : '♡ Mon préféré';
  }
}

/** Triangles affichés sous une carte (l'animal du jeu : couches de poils à part). */
function showTris(c) {
  const d = c.pet;
  c.tris.textContent = d.furTriangles ? `${fmtInt(d.triangles)} triangles (+ ${fmtInt(d.furTriangles)} en couches de poils)` : `${fmtInt(d.triangles)} triangles`;
}

/**
 * Robe et race choisies, sur chaque animal d'une espèce. L'animal du jeu est reconstruit (sculpté par le
 * code : cela prend un moment, on affiche un mot d'attente avant). look : { coat, breed } pour forcer d'autres
 * réglages (planches) ; sync : sans attente.
 */
function applyLook(sp, only = null, look = null, sync = false) {
  const st = state[sp];
  const coatId = look?.coat ?? st.coat;
  const breedId = look?.breed ?? st.breed;
  const breed = breedOf(sp, breedId);
  // (sphynx : peau nue rose avec la robe « d'origine », comme le sphynx du jeu)
  const glbCoat = coatId === 'origine' ? (breed.skin ? { pattern: 'solid', base: breed.skin } : null) : coatOf(sp, coatId);
  const coat = coatId === 'origine' ? null : coatOf(sp, coatId);
  const size = breedId === 'origine' ? 1 : getBreed(sp, breedId)?.scale ?? 1;
  for (const c of cards) {
    if (c.species !== sp || !c.pet || (only && c !== only)) continue;
    if (c.cand.kind === 'proc') {
      const gb = gameBreed(sp, breedId);
      const key = `${gb}|${coatId}`;
      if (c.built === key) continue;
      c.built = key;
      const rebuild = () => {
        if (c.built !== key) return; // (un autre choix est arrivé entre-temps)
        c.pet.build(gb, coat);
        showTris(c);
        c.loading.hidden = true;
        c.loading.textContent = 'Chargement…';
      };
      if (c.pet.model && !sync) {
        c.loading.textContent = sp === 'cat' ? 'Le jeu dessine ce chat…' : 'Le jeu dessine ce lapin…';
        c.loading.hidden = false;
        setTimeout(rebuild, 40);
      } else rebuild();
    } else {
      c.pet.setCoat(glbCoat);
      c.pet.setBreed(breed, size);
    }
  }
}

async function loadCard(card) {
  try {
    if (card.cand.kind === 'proc') {
      card.pet = new ProcPet(card.species);
    } else {
      card.pet = await loadGlbPet(card.cand, card.species);
      showTris(card);
      card.weight.textContent = fmtBytes(card.pet.bytes);
    }
    applyLook(card.species, card, null, true);
    stage.addPet(card.pet.holder);
    card.loading.hidden = true;
  } catch (err) {
    console.error(err);
    card.loading.textContent = 'Ce modèle n’a pas pu être chargé.';
  }
}

const loads = {};
function ensureLoaded(sp) {
  loads[sp] ??= Promise.all(cards.filter((c) => c.species === sp).map((c) => loadCard(c)))
    .then(() => stage.precompile())
    .then(() => {
      window.cmp.ready[sp] = true;
    });
  return loads[sp];
}

// ------------------------------------------------------------------ plein écran

const fs = { el: document.getElementById('fs'), view: document.getElementById('fs-view'), card: null, pointers: new Map(), pinch: 0 };
fs.title = fs.el.querySelector('#fs-title');
fs.badge = fs.view.querySelector('.badge');
fs.el.querySelector('.fs-close').addEventListener('click', () => closeFull());
// Rendu précédent / suivant sans quitter le plein écran (même angle de vue).
for (const b of fs.el.querySelectorAll('.fs-nav')) {
  b.addEventListener('click', () => {
    const ready = cards.filter((c) => c.species === state.species && c.pet && c.loading.hidden);
    const i = ready.indexOf(fs.card);
    const next = ready[(i + Number(b.dataset.dir) + ready.length) % ready.length];
    if (!next || next === fs.card) return;
    Object.assign(next, { yaw: fs.card.yaw, pitch: fs.card.pitch, zoom: fs.card.zoom, hold: fs.card.hold });
    fs.card.zoom = 1;
    fs.card.pitch = 0;
    fs.card = next;
    fs.title.textContent = next.cand.name;
  });
}

function openFull(card, push = true) {
  if (!card?.pet) return;
  fs.card = card;
  fs.title.textContent = card.cand.name;
  fs.el.hidden = false;
  document.body.classList.add('fs-open');
  if (push) history.pushState({ full: card.cand.id }, '', `#${card.cand.id}`);
  fs.el.querySelector('.fs-close').focus({ preventScroll: true });
}

function closeFull(fromHistory = false) {
  if (!fs.card) return;
  const card = fs.card;
  fs.card = null;
  card.zoom = 1;
  card.pitch = 0;
  fs.el.hidden = true;
  document.body.classList.remove('fs-open');
  if (!fromHistory && history.state?.full) history.back();
  card.view.focus({ preventScroll: true });
}

window.addEventListener('popstate', () => closeFull(true));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && fs.card) closeFull();
});

// Faire tourner du doigt (ou à la souris), pincer ou molette pour zoomer.
fs.view.addEventListener('pointerdown', (e) => {
  fs.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  fs.view.setPointerCapture?.(e.pointerId);
  if (fs.pointers.size === 2) {
    const [a, b] = [...fs.pointers.values()];
    fs.pinch = Math.hypot(a.x - b.x, a.y - b.y);
  }
});
fs.view.addEventListener('pointermove', (e) => {
  const p = fs.pointers.get(e.pointerId);
  const card = fs.card;
  if (!p || !card) return;
  if (fs.pointers.size === 1) {
    card.yaw += (e.clientX - p.x) * 0.012;
    card.pitch = Math.min(0.6, Math.max(-0.1, card.pitch + (e.clientY - p.y) * 0.004));
  }
  p.x = e.clientX;
  p.y = e.clientY;
  if (fs.pointers.size === 2) {
    const [a, b] = [...fs.pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (fs.pinch > 0) card.zoom = Math.min(3, Math.max(0.7, card.zoom * (d / fs.pinch)));
    fs.pinch = d;
  }
  card.hold = performance.now() + 4000; // (lâché, il se remet à tourner tout seul après 4 s)
});
const release = (e) => {
  fs.pointers.delete(e.pointerId);
  fs.pinch = 0;
};
fs.view.addEventListener('pointerup', release);
fs.view.addEventListener('pointercancel', release);
fs.view.addEventListener('wheel', (e) => {
  if (!fs.card) return;
  e.preventDefault();
  fs.card.zoom = Math.min(3, Math.max(0.7, fs.card.zoom * Math.exp(-e.deltaY * 0.0015)));
}, { passive: false });

// ------------------------------------------------------------------ animation et rendu

const NO_POSE = { sit: 's’asseoir', stand: 'se dresser', groom: 'faire sa toilette' };
function gaitBadge(card, gait = state[card.species].gait) {
  const used = card.pet.used;
  if (!used || used === gait) return '';
  if (card.cand.kind === 'proc' && NO_POSE[gait]) return `Le lapin du jeu ne sait pas ${NO_POSE[gait]} : accroupi à la place`;
  const g = GAIT_NAMES[card.species][gait];
  return `${g[0].toUpperCase()}${g.slice(1)} absent : ${GAIT_NAMES[card.species][used]} à la place`;
}

function setBadge(el, text) {
  if (el.textContent !== text) el.textContent = text;
  el.hidden = !text;
}

/** Avance l'animation d'une carte de dt secondes. */
function step(card, dt, now, gait = state[card.species].gait) {
  const g = gaitOf(card.species, gait);
  const ground = card.pet.update(dt, gait, g.v);
  if (!(card.hold > now)) card.yaw += SPIN * dt;
  // Le sol recule sous l'animal (il regarde vers +Z, tourné de yaw).
  card.scroll.x -= Math.sin(card.yaw) * ground * dt;
  card.scroll.z -= Math.cos(card.yaw) * ground * dt;
}

const _head = new THREE.Vector3();
function draw(card, rect, focus = null) {
  const d = card.pet;
  const v = { holder: d.holder, scroll: card.scroll, size: d.size * (d.fit ?? 1), frame: FRAME[card.species], long: d.long ?? 1, tall: d.tall ?? 1, yaw: card.yaw, pitch: card.pitch, zoom: card.zoom };
  if (focus === 'head') {
    d.holder.rotation.y = card.yaw;
    v.focus = 'head';
    v.head = d.headWorld(_head);
  }
  stage.render(rect, v);
}

/** Cartes visibles (ou la carte en plein écran) : animées et dessinées. dt : secondes écoulées. */
function frame(dt) {
  const now = performance.now();
  stage.resize();
  stage.clear();
  stage.tick(dt);
  const H = window.innerHeight;
  if (fs.card) {
    const rect = fs.view.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      step(fs.card, dt, now);
      draw(fs.card, rect);
      setBadge(fs.badge, gaitBadge(fs.card));
    }
    return;
  }
  for (const card of cards) {
    if (card.species !== state.species || !card.pet || !card.loading.hidden) continue;
    const rect = card.view.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= H || rect.width <= 0) continue;
    step(card, dt, now);
    draw(card, rect);
    setBadge(card.badge, gaitBadge(card));
  }
}

let last = performance.now();
function loop(t) {
  const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
  last = t;
  if (!CAPTURE) frame(dt);
  requestAnimationFrame(loop);
}

/** Remet un animal au départ (même instant pour tous). */
function resetCard(c, yaw = START_YAW) {
  c.yaw = yaw;
  c.pitch = 0;
  c.zoom = 1;
  c.scroll.x = 0;
  c.scroll.z = 0;
  c.pet?.reset();
}

// ------------------------------------------------------------------ planches (captures automatiques)

const sheet = { bg: document.getElementById('sheet'), fg: document.getElementById('sheet-fg') };

/**
 * Dessine une planche : une grille de cases, chacune un rendu avec ses réglages, au même instant.
 * spec : { title, cols, w, h (taille d'une case, px), top, left (marges des titres), rows: [{ label,
 * cells: [{ id, coat, breed, gait, t, yaw, focus, tag, zoom }] }], colLabels: [] }.
 * Chaque case : l'animal est remis au départ, puis avancé de t secondes dans l'allure demandée.
 */
async function drawSheet(spec) {
  const { w, h: hh, top = 30, left = 0, gap = 6 } = spec;
  sheet.bg.hidden = false;
  sheet.fg.hidden = false;
  sheet.fg.replaceChildren();
  document.body.classList.add('sheet-open');
  stage.resize();
  stage.clear();
  if (spec.title) sheet.fg.append(h('div', { class: 'sheettitle', style: `left:${left}px; top:6px` }, spec.title));
  (spec.colLabels ?? []).forEach((t, i) => {
    sheet.fg.append(h('div', { class: 'collabel', style: `left:${left + i * (w + gap)}px; top:${top - 22}px; width:${w}px` }, t));
  });
  for (const [r, row] of spec.rows.entries()) {
    const y = top + r * (hh + gap);
    if (row.label) sheet.fg.append(h('div', { class: 'rowlabel', style: `left:8px; top:${y + 6}px; width:${left - 14}px` }, row.label));
    for (const [i, cell] of row.cells.entries()) {
      if (!cell) continue;
      const card = cards.find((c) => c.cand.id === cell.id);
      if (!card?.pet) continue;
      const sp = card.species;
      applyLook(sp, card, { coat: cell.coat ?? state[sp].coat, breed: cell.breed ?? state[sp].breed }, true);
      resetCard(card, cell.yaw ?? START_YAW);
      const n = Math.round((cell.t ?? 1.5) * 60);
      for (let k = 0; k < n; k++) step(card, 1 / 60, Infinity, cell.gait ?? 'stop');
      card.yaw = cell.yaw ?? START_YAW;
      card.zoom = cell.zoom ?? 1;
      const x = left + i * (w + gap);
      draw(card, { left: x, top: y, right: x + w, bottom: y + hh, width: w, height: hh }, cell.focus ?? null);
      const tag = cell.tag ?? gaitBadge(card, cell.gait ?? 'stop');
      if (tag) sheet.fg.append(h('span', { class: 'tag', style: `left:${x + 6}px; top:${y + hh - 26}px; max-width:${w - 12}px` }, tag));
    }
  }
}

function closeSheet() {
  sheet.bg.hidden = true;
  sheet.fg.hidden = true;
  document.body.classList.remove('sheet-open');
  for (const sp of SPECIES) applyLook(sp, null, null, true);
}

// Outils pour les captures : réglages, avance de l'horloge pas à pas, rendu immédiat, planches.
window.cmp = {
  state,
  cards,
  camYaw: CAMERA_AZIMUTH,
  set(kind, id) {
    choose(kind, id);
  },
  tab: (sp) => showSpecies(sp),
  load: (sp) => ensureLoaded(sp),
  reset(yaw = START_YAW) {
    for (const c of cards) resetCard(c, yaw);
  },
  /** Avance toutes les cartes de l'onglet (visibles ou non) de s secondes par pas de 1/60 s, sans rotation. */
  advance(s, spin = false) {
    const n = Math.round(s * 60);
    for (let i = 0; i < n; i++) {
      for (const c of cards) {
        if (!c.pet || c.species !== state.species) continue;
        const y = c.yaw;
        step(c, 1 / 60, Infinity);
        if (!spin) c.yaw = y;
      }
      stage.tick(1 / 60);
    }
    this.render();
  },
  render() {
    stage.resize();
    stage.clear();
    const H = window.innerHeight;
    for (const c of fs.card ? [fs.card] : cards) {
      if (!c.pet || c.species !== state.species) continue;
      const rect = (fs.card ? fs.view : c.view).getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= H) continue;
      draw(c, rect);
      setBadge(fs.card ? fs.badge : c.badge, gaitBadge(c));
    }
  },
  sheet: drawSheet,
  closeSheet,
  open: (id) => openFull(cards.find((c) => c.cand.id === id), false),
  close: () => closeFull(true),
  ready: { cat: false, rabbit: false },
};

showSpecies(state.species);
refreshFav();
requestAnimationFrame(loop);
// L'autre onglet se charge ensuite, sans attendre qu'on l'ouvre.
ensureLoaded(state.species).then(() => ensureLoaded(state.species === 'cat' ? 'rabbit' : 'cat'));
