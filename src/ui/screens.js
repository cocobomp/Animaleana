// Écrans plein écran : choix du profil et création de l'avatar.

import * as THREE from 'three';
import { h, hexColor } from './dom.js';
import { focusField } from './viewport.js';
import { t, getLang, setLang } from '../i18n.js';
import { listProfiles, loadProfile, createProfile, deleteProfile, saveProfile } from '../sim/profile.js';
import { PLACES, PLACE_IDS } from '../sim/places.js';
import { L } from '../i18n.js';
import { buildAvatar, animateAvatarWalk, updateAvatarLife } from '../game/models/avatarModel.js';
import { disposeModel } from '../game/models/animalModel.js';
import { openExport, pickRestoreFile } from './saveGame.js'; // 💾 sauvegarder / 📂 restaurer une partie (fichier)

const SKINS = [0xf5d3b8, 0xe8b796, 0xd09a72, 0xa9714b, 0x7a4b2e, 0x4e2f1e];
const HAIRS = [0x1b1411, 0x4a2f1d, 0x8a5a2b, 0xd2a557, 0xe8d39a, 0xa63a1f, 0x9a9a9a, 0x5b4bb5, 0xe26fa6];
const CLOTHES = [0x3f7cc4, 0xd94848, 0x3f9b5b, 0xf0c33c, 0x8b5ac7, 0xf28fb3, 0xf2f2f2, 0x2b2b2b, 0x2d3a4f, 0x7b5a3c];
const STYLES = ['short', 'long', 'ponytail', 'curly', 'bun', 'braid', 'bald'];

export function showProfiles(ui) {
  const render = () => {
    const profiles = listProfiles();
    const list = profiles.map((p) => h('div', { class: 'profile' },
      h('button', {
        class: 'profile-play',
        onClick: () => {
          const prof = loadProfile(p.id);
          if (prof) ui.game.start(prof);
        },
      }, h('b', {}, p.name), h('small', {}, `${p.mode === 'sandbox' ? t('modeSandbox') : t('modeManage')} · ${t('animalsCount', { n: p.animals })}`),
      // Copie gardée avant qu'une partie restaurée la remplace (src/sim/saveStore.js) : on peut y rejouer ou la supprimer.
      p.backup ? h('small', { class: 'sv-badge' }, t('sv_backupBadge')) : null),
      h('button', {
        class: 'icon danger',
        title: t('delete'),
        onClick: async () => {
          if (await ui.confirm(t('confirmDelete', { name: p.name }))) {
            deleteProfile(p.id);
            render();
          }
        },
      }, '🗑️')));

    ui.screen.replaceChildren(h('div', { class: 'menu' },
      h('div', { class: 'logo' }, '🐴🐶🐱🐰'),
      h('h1', {}, t('title')),
      h('p', { class: 'tagline' }, t('tagline')),
      h('div', { class: 'lang' }, [['fr', '🇫🇷 Français'], ['en', '🇬🇧 English']].map(([l, label]) => h('button', {
        class: getLang() === l ? 'primary small' : 'small',
        onClick: () => { setLang(l); render(); },
      }, label))),
      profiles.length ? h('h2', {}, t('profiles')) : null,
      h('div', { class: 'profiles' }, list),
      h('button', { class: 'primary big', onClick: () => newProfile(ui, render) }, `➕ ${t('newProfile')}`),
      // La partie dans un fichier : pour changer d'appareil ou d'adresse du jeu (src/ui/saveGame.js).
      h('div', { class: 'save-tools' },
        profiles.length ? h('button', {
          onClick: () => openExport(ui, { ids: profiles.map((p) => p.id), checked: profiles.filter((p) => !p.backup).map((p) => p.id) }),
        }, `💾 ${t(profiles.length > 1 ? 'sv_saveMany' : 'sv_save')}`) : null,
        h('button', { onClick: () => pickRestoreFile(ui) }, `📂 ${t('sv_restore')}`)),
      h('p', { class: 'note save-why' }, t('sv_why')),
      // État du cache hors ligne (src/main.js) : prêt, en préparation, ou impossible en http.
      h('p', { class: 'offline' }, window.offlineState
        ? `${{ ready: '✅', preparing: '⏳', unavailable: 'ℹ️', file: '📁' }[window.offlineState]} ${t({ ready: 'offlineReady', preparing: 'offlinePreparing', unavailable: 'offlineUnavailable', file: 'offlineFile' }[window.offlineState])}`
        : `📴 ${t('offline')}`),
      // Version du jeu (injectée au build par vite.config.js) : pratique pour savoir ce qu'on teste.
      h('p', { class: 'version' }, versionLine()),
      // Depuis le site : un fichier unique à télécharger puis à passer par AirDrop, clé USB ou mail
      // à un ordinateur sans internet (il s'ouvre en double-cliquant). Pas proposé quand on y joue déjà.
      location.protocol.startsWith('http') && typeof __APP_VERSION__ !== 'undefined'
        ? h('p', { class: 'portable' }, h('a', { href: './ferme-madichelle.html', download: 'La ferme à Madichelle.html' }, `📦 ${t('portableLink')}`), h('small', {}, t('portableHelp')))
        : null));
    ui.screen.hidden = false;
  };
  render();
  ui.screen.scrollTop = 0;
}

function newProfile(ui, back) {
  let mode = 'sandbox';
  // Prénom de l'enfant : majuscule au début, pas de correction ni de suggestions ; Entrée = « Créer » (go).
  const name = h('input', {
    type: 'text', maxlength: 16, placeholder: t('profileName'),
    enterkeyhint: 'go', autocapitalize: 'words', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
  });
  const modes = h('div', { class: 'modes' });
  const drawModes = () => modes.replaceChildren(...['sandbox', 'manage'].map((m) => h('button', {
    class: `mode-card ${mode === m ? 'selected' : ''}`,
    onClick: () => { mode = m; drawModes(); },
  }, h('b', {}, m === 'sandbox' ? `🏖️ ${t('modeSandbox')}` : `🪙 ${t('modeManage')}`),
  h('small', {}, t(m === 'sandbox' ? 'modeSandboxDesc' : 'modeManageDesc')))));
  drawModes();
  const create = () => {
    const n = name.value.trim();
    if (!n) {
      name.focus();
      return;
    }
    chooseHome(ui, (home) => {
      const p = createProfile(n, mode, home);
      saveProfile(p);
      showAvatarEditor(ui, p, () => ui.game.start(p));
    }, () => newProfile(ui, back));
  };
  // Entrée = « Créer », Échap = « Annuler » (comme dans la fenêtre du nom d'un animal).
  name.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      create();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      back();
    }
  });
  ui.screen.replaceChildren(h('div', { class: 'menu' },
    h('h1', {}, t('newProfile')),
    h('label', { class: 'field' }, h('span', {}, t('profileName')), name),
    modes,
    h('div', { class: 'row end' },
      h('button', { onClick: back }, t('cancel')),
      h('button', { class: 'primary', onClick: create }, t('create')))));
  showScreen(ui);
  // Focus tout de suite, dans le tap sur « Nouveau profil » : sur iPhone, le clavier s'ouvre alors tout seul
  // (un focus donné plus tard, dans un setTimeout, ne l'ouvre pas). Repli si le navigateur l'a refusé.
  focusField(name);
  if (document.activeElement !== name) setTimeout(() => focusField(name), 30);
}

/** Montre l'écran plein écran, remonté en haut (sinon il gardait le défilement de l'écran précédent). */
function showScreen(ui) {
  ui.screen.hidden = false;
  ui.screen.scrollTop = 0;
}

/** Où veux-tu habiter ? Le décor, la météo et les races du refuge en dépendent. */
function chooseHome(ui, onChoose, back) {
  let selected = 'maison';
  const render = () => {
    ui.screen.replaceChildren(h('div', { class: 'menu home-picker' },
      h('h1', {}, `🏡 ${t('chooseHome')}`),
      h('p', { class: 'tagline' }, t('chooseHomeHelp')),
      h('div', { class: 'cards' }, PLACE_IDS.map((id) => {
        const pl = PLACES[id];
        return h('button', { class: `card place ${selected === id ? 'selected' : ''}`, onClick: () => { selected = id; render(); } },
          h('span', { class: 'card-emoji' }, pl.flag),
          h('span', { class: 'card-main' }, h('b', {}, L(pl.name)), h('small', {}, L(pl.region)), h('small', {}, L(pl.climate))));
      })),
      h('div', { class: 'row end' },
        h('button', { onClick: back }, t('cancel')),
        h('button', { class: 'primary', onClick: () => onChoose(selected) }, `${t('liveHere')} ${PLACES[selected].flag}`))));
    ui.screen.hidden = false;
  };
  render();
  ui.screen.scrollTop = 0; // (redessiné à chaque choix en gardant le défilement ; en haut seulement à l'arrivée)
}

// ---------------------------------------------------------------- avatar

let preview = null;

// Aperçu de l'avatar : le personnage regarde la caméra, à peine de trois quarts (tourné vers la
// lumière), avec un très léger balancement. On le fait tourner du doigt (ou à la souris) pour voir
// la coiffure de dos ; lâché, il revient doucement de face. (Avant, il tournait sans arrêt sur
// lui-même : on le voyait surtout de profil ou de dos.)
const PREVIEW_YAW = 0.32;
const PREVIEW_FOV = 30;
// Ce qui doit tenir en entier (m) : du dessous des pieds au haut de la coiffure, et la largeur.
const PREVIEW_BOTTOM = -0.02;
const PREVIEW_H = 1.88;
const PREVIEW_W = 0.82;
// Marges (px) : en bas, la place de l'indication « Fais-le tourner du doigt ».
const PREVIEW_PAD_TOP = 8;
const PREVIEW_PAD_BOTTOM = 30;

function getPreview() {
  if (preview) return preview;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(PREVIEW_FOV, 1, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  // Petite lumière de face, douce : le visage n'est jamais dans l'ombre.
  const fill = new THREE.DirectionalLight(0xfff4ea, 0.5);
  fill.position.set(-1, 1.6, 4);
  scene.add(fill);
  const holder = new THREE.Group();
  scene.add(holder);
  preview = { renderer, scene, camera, holder, avatar: null, running: false, yaw: PREVIEW_YAW, drag: null, idle: 99 };
  // Tourner le personnage en le faisant glisser (le défilement vertical de la page reste possible).
  const el = renderer.domElement;
  el.style.touchAction = 'pan-y';
  el.style.cursor = 'grab';
  el.addEventListener('pointerdown', (e) => {
    preview.drag = { x: e.clientX, yaw: preview.yaw, id: e.pointerId };
    el.setPointerCapture?.(e.pointerId);
    el.style.cursor = 'grabbing';
  });
  el.addEventListener('pointermove', (e) => {
    const d = preview.drag;
    if (!d || d.id !== e.pointerId) return;
    preview.yaw = d.yaw + (e.clientX - d.x) * 0.012;
    preview.idle = 0;
  });
  const release = () => {
    preview.drag = null;
    preview.idle = 0;
    el.style.cursor = 'grab';
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  return preview;
}

/**
 * Recule la caméra pour que le personnage tienne en entier, quelle que soit la forme de l'aperçu
 * (large sur téléphone, haut et étroit sur ordinateur), au-dessus de l'indication du bas.
 */
function framePreview(camera, w, h) {
  const t = Math.tan((PREVIEW_FOV / 2) * (Math.PI / 180));
  const pads = PREVIEW_PAD_TOP + PREVIEW_PAD_BOTTOM;
  // Hauteur vue à la distance du personnage : il faut y loger sa hauteur et les marges, et sa largeur.
  const view = Math.max((PREVIEW_H * h) / Math.max(1, h - pads), (PREVIEW_W * h) / w);
  const k = view / h; // mètres par pixel
  const spare = view - PREVIEW_H - pads * k; // place en trop : partagée entre le haut et le bas
  const mid = PREVIEW_BOTTOM - (PREVIEW_PAD_BOTTOM * k + spare / 2) + view / 2;
  camera.aspect = w / h;
  camera.position.set(0, mid + 0.22, view / 2 / t);
  camera.lookAt(0, mid, 0);
  camera.updateProjectionMatrix();
}

/** Angle équivalent à a (à un tour près) le plus proche de target : pour revenir de face sans faire un tour. */
const nearAngle = (a, target) => target + ((((a - target) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

export function showAvatarEditor(ui, profile, onDone) {
  const look = { ...profile.avatar };
  const pv = getPreview();
  const canvasBox = h('div', { class: 'avatar-preview' }, pv.renderer.domElement, h('span', { class: 'avatar-spin' }, `↔ ${t('avatarSpin')}`));
  const rebuild = () => {
    if (pv.avatar) {
      pv.holder.remove(pv.avatar.root);
      disposeModel(pv.avatar.root);
    }
    pv.avatar = buildAvatar(look);
    pv.holder.add(pv.avatar.root);
  };
  rebuild();
  pv.running = true;
  pv.yaw = PREVIEW_YAW;
  pv.idle = 99;
  pv.drag = null;
  let last = performance.now();
  let time = 0;
  // Le personnage est vivant dans l'aperçu : il respire, cligne des yeux, regarde un peu autour de
  // lui, mais sans geste d'attente (se gratter la tête, s'étirer…) : rien ne cache le visage.
  const life = { speed: 0, noGestures: true };
  const loop = () => {
    if (!pv.running) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (pv.avatar) {
      animateAvatarWalk(pv.avatar, 0, 0);
      updateAvatarLife(pv.avatar, dt, life);
    }
    const w = canvasBox.clientWidth || 240;
    const hh = canvasBox.clientHeight || 300;
    const px = pv.renderer.getPixelRatio();
    if (pv.renderer.domElement.width !== Math.floor(w * px) || pv.renderer.domElement.height !== Math.floor(hh * px)) {
      pv.renderer.setSize(w, hh, false);
      framePreview(pv.camera, w, hh);
    }
    // Lâché depuis un moment : il revient de face (par le plus court chemin), puis se balance à peine.
    if (!pv.drag) {
      pv.idle += dt;
      if (pv.idle > 1.6) {
        const target = nearAngle(PREVIEW_YAW, pv.yaw);
        pv.yaw += (target - pv.yaw) * Math.min(1, dt * 2.2);
      }
    }
    const sway = Math.min(1, Math.max(0, pv.idle - 2.5));
    pv.holder.rotation.y = pv.yaw + 0.07 * Math.sin(time * 0.5) * sway;
    pv.renderer.render(pv.scene, pv.camera);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const swatches = (key, colors) => h('div', { class: 'swatches' }, colors.map((c) => h('button', {
    class: `swatch-btn ${look[key] === c ? 'selected' : ''}`,
    style: { background: hexColor(c) },
    'aria-label': hexColor(c),
    onClick: (e) => {
      look[key] = c;
      e.currentTarget.parentElement.querySelectorAll('.selected').forEach((x) => x.classList.remove('selected'));
      e.currentTarget.classList.add('selected');
      rebuild();
    },
  })));
  const styles = h('div', { class: 'row wrap' }, STYLES.map((s) => h('button', {
    class: `small ${look.hairStyle === s ? 'primary' : ''}`,
    onClick: (e) => {
      look.hairStyle = s;
      e.currentTarget.parentElement.querySelectorAll('.primary').forEach((x) => x.classList.remove('primary'));
      e.currentTarget.classList.add('primary');
      rebuild();
    },
  }, t(`hs_${s}`))));
  const hat = h('label', { class: 'check' }, h('input', {
    type: 'checkbox',
    checked: look.hat,
    onChange: (e) => { look.hat = e.target.checked; rebuild(); },
  }), ` 🧢 ${t('hat')}`);

  const done = () => {
    pv.running = false;
    profile.avatar = look;
    saveProfile(profile);
    ui.game?.player?.setAvatar(look);
    onDone?.();
  };

  ui.screen.replaceChildren(h('div', { class: 'menu avatar-editor' },
    h('h1', {}, `👕 ${t('avatarTitle')}`),
    h('div', { class: 'avatar-layout' },
      canvasBox,
      h('div', { class: 'avatar-options' },
        h('h3', {}, t('skin')), swatches('skin', SKINS),
        h('h3', {}, t('hair')), swatches('hair', HAIRS),
        h('h3', {}, t('hairStyle')), styles,
        h('h3', {}, t('top')), swatches('top', CLOTHES),
        h('h3', {}, t('bottom')), swatches('bottom', CLOTHES),
        h('h3', {}, t('shoes')), swatches('shoes', CLOTHES),
        hat)),
    h('button', { class: 'primary big', onClick: done }, `✅ ${t('done')}`)));
  showScreen(ui);
}

/** « v0.3.0 · 2026-10-16 11:05 UTC · cb4307f » (valeurs définies au build ; vides en développement). */
function versionLine() {
  const v = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
  const built = typeof __APP_BUILT__ !== 'undefined' ? __APP_BUILT__ : '';
  const commit = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : '';
  return [`v${v}`, built && `${built} UTC`, commit].filter(Boolean).join(' · ');
}
