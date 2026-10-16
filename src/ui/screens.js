// Écrans plein écran : choix du profil et création de l'avatar.

import * as THREE from 'three';
import { h, hexColor } from './dom.js';
import { t, getLang, setLang } from '../i18n.js';
import { listProfiles, loadProfile, createProfile, deleteProfile, saveProfile } from '../sim/profile.js';
import { PLACES, PLACE_IDS } from '../sim/places.js';
import { L } from '../i18n.js';
import { buildAvatar } from '../game/models/avatarModel.js';
import { disposeModel } from '../game/models/animalModel.js';

const SKINS = [0xf5d3b8, 0xe8b796, 0xd09a72, 0xa9714b, 0x7a4b2e, 0x4e2f1e];
const HAIRS = [0x1b1411, 0x4a2f1d, 0x8a5a2b, 0xd2a557, 0xe8d39a, 0xa63a1f, 0x9a9a9a, 0x5b4bb5, 0xe26fa6];
const CLOTHES = [0x3f7cc4, 0xd94848, 0x3f9b5b, 0xf0c33c, 0x8b5ac7, 0xf28fb3, 0xf2f2f2, 0x2b2b2b, 0x2d3a4f, 0x7b5a3c];
const STYLES = ['short', 'long', 'ponytail', 'curly', 'bald'];

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
      }, h('b', {}, p.name), h('small', {}, `${p.mode === 'sandbox' ? t('modeSandbox') : t('modeManage')} · ${t('animalsCount', { n: p.animals })}`)),
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
      // État du cache hors ligne (src/main.js) : prêt, en préparation, ou impossible en http.
      h('p', { class: 'offline' }, window.offlineState
        ? `${{ ready: '✅', preparing: '⏳', unavailable: 'ℹ️' }[window.offlineState]} ${t({ ready: 'offlineReady', preparing: 'offlinePreparing', unavailable: 'offlineUnavailable' }[window.offlineState])}`
        : `📴 ${t('offline')}`),
      // Version du jeu (injectée au build par vite.config.js) : pratique pour savoir ce qu'on teste.
      h('p', { class: 'version' }, versionLine())));
    ui.screen.hidden = false;
  };
  render();
}

function newProfile(ui, back) {
  let mode = 'sandbox';
  const name = h('input', { type: 'text', maxlength: 16, placeholder: t('profileName') });
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
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
  ui.screen.replaceChildren(h('div', { class: 'menu' },
    h('h1', {}, t('newProfile')),
    h('label', { class: 'field' }, h('span', {}, t('profileName')), name),
    modes,
    h('div', { class: 'row end' },
      h('button', { onClick: back }, t('cancel')),
      h('button', { class: 'primary', onClick: create }, t('create')))));
  ui.screen.hidden = false;
  setTimeout(() => name.focus(), 30);
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
  const loop = () => {
    if (!pv.running) return;
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
  ui.screen.hidden = false;
}

/** « v0.3.0 · 2026-10-16 11:05 UTC · cb4307f » (valeurs définies au build ; vides en développement). */
function versionLine() {
  const v = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
  const built = typeof __APP_BUILT__ !== 'undefined' ? __APP_BUILT__ : '';
  const commit = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : '';
  return [`v${v}`, built && `${built} UTC`, commit].filter(Boolean).join(' · ');
}
