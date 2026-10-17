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
import { cloudCard, syncMessage } from './cloudAccount.js'; // ☁️ compte Google (facultatif)
import { onCloudChange } from '../cloud/account.js';

const SKINS = [0xf5d3b8, 0xe8b796, 0xd09a72, 0xa9714b, 0x7a4b2e, 0x4e2f1e];
const HAIRS = [0x1b1411, 0x4a2f1d, 0x8a5a2b, 0xd2a557, 0xe8d39a, 0xa63a1f, 0x9a9a9a, 0x5b4bb5, 0xe26fa6];
const CLOTHES = [0x3f7cc4, 0xd94848, 0x3f9b5b, 0xf0c33c, 0x8b5ac7, 0xf28fb3, 0xf2f2f2, 0x2b2b2b, 0x2d3a4f, 0x7b5a3c];
const STYLES = ['short', 'long', 'ponytail', 'curly', 'bun', 'braid', 'bald'];

let stopCloudWatch = null; // un seul abonnement aux changements du compte, même si l'écran est rouvert

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
      // Compte Google facultatif : sans compte on joue en invité (parties sur l'appareil).
      cloudCard(ui),
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
  // Connexion, synchro : l'écran se redessine tant qu'il est affiché (parties récupérées comprises).
  let lastReport = null;
  stopCloudWatch?.();
  stopCloudWatch = onCloudChange((state) => {
    if (ui.game.running || ui.screen.hidden || !ui.screen.querySelector('.profiles')) return;
    const y = ui.screen.scrollTop;
    render();
    ui.screen.scrollTop = y;
    if (state.report && state.report !== lastReport) {
      lastReport = state.report;
      const msg = syncMessage(state.report);
      if (msg) ui.toast(msg, 6000);
    }
  });
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

function getPreview() {
  if (preview) return preview;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.1, 4.4);
  camera.lookAt(0, 0.85, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const holder = new THREE.Group();
  scene.add(holder);
  preview = { renderer, scene, camera, holder, avatar: null, running: false };
  return preview;
}

export function showAvatarEditor(ui, profile, onDone) {
  const look = { ...profile.avatar };
  const pv = getPreview();
  const canvasBox = h('div', { class: 'avatar-preview' }, pv.renderer.domElement);
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
  let last = performance.now();
  const loop = () => {
    if (!pv.running) return;
    // Le personnage est vivant dans l'aperçu : il respire, cligne des yeux, bouge un peu.
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (pv.avatar) {
      animateAvatarWalk(pv.avatar, 0, 0);
      updateAvatarLife(pv.avatar, dt);
    }
    const w = canvasBox.clientWidth || 240;
    const hh = canvasBox.clientHeight || 300;
    if (pv.renderer.domElement.width !== Math.floor(w * pv.renderer.getPixelRatio())) {
      pv.renderer.setSize(w, hh, false);
      pv.camera.aspect = w / hh;
      pv.camera.updateProjectionMatrix();
    }
    pv.holder.rotation.y += 0.01;
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
