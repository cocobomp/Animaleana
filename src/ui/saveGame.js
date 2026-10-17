// « 💾 Sauvegarder ma partie » et « 📂 Restaurer une partie » : la partie dans un fichier, pour changer
// d'appareil (téléphone → ordinateur) ou d'adresse du jeu (chaque adresse a ses propres sauvegardes).
// Ici l'interface ; vérifier, fusionner et garder une copie de secours : src/sim/saveFile.js et src/sim/saveStore.js.

import { h } from './dom.js';
import { t, getLang } from '../i18n.js';
import {
  serializeSave, parseSave, saveFileName, profileSummary, compareProfiles, MAX_FILE_BYTES, FILE_MIME, FILE_EXT,
} from '../sim/saveFile.js';
import { deviceStore, restoreAsNew, restoreReplace } from '../sim/saveStore.js';
import { loadProfile } from '../sim/profile.js';

const appVersion = () => (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev');
const locale = () => (getLang() === 'fr' ? 'fr-FR' : 'en-GB');

/** « 17 octobre 2026, 14:05 » (ou « date inconnue »). */
function fmtDate(ts) {
  if (!ts) return t('sv_dateUnknown');
  const d = new Date(ts);
  return `${d.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })}, ${d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`;
}

/** Nom de la copie de secours : « Léana · secours 17/10 ». */
const backupNameOf = (old) => t('sv_backupName', { name: old.name, date: new Date().toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' }) });

/**
 * Fenêtre en plusieurs étapes : la première s'ouvre avec ui.showModal, les suivantes remplacent son contenu
 * (ui.showModal met en attente une fenêtre demandée pendant qu'une autre est ouverte).
 */
function sheet(ui) {
  let box = null;
  return (content) => {
    const nodes = [content].flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
    if (box?.isConnected && ui.modalOpen) {
      box.replaceChildren(...nodes);
      box.scrollTop = 0;
      return;
    }
    ui.showModal(nodes);
    const b = ui.modal.querySelector('.modal-box');
    box = b && nodes[0] instanceof Node && b.contains(nodes[0]) ? b : null;
  };
}

/** Carte d'une partie : prénom, niveau, animaux par espèce, date de la dernière sauvegarde. */
function summaryCard(sum, { onClick = null } = {}) {
  const animals = sum.animals ? `${t('animalsCount', { n: sum.animals })} · ${sum.species.map((s) => `${s.emoji} ${s.n}`).join('  ')}` : t('sv_animals0');
  const body = [
    h('span', { class: 'card-emoji' }, sum.backup ? '🛟' : '👤'),
    h('span', { class: 'card-main' },
      h('b', {}, sum.name),
      h('small', {}, `⭐ ${t('level', { n: sum.level })} · ${t(sum.mode === 'manage' ? 'modeManage' : 'modeSandbox')}`),
      h('span', { class: 'sv-animals' }, animals),
      h('small', {}, t('sv_savedOn', { date: fmtDate(sum.updatedAt) })),
      sum.backup ? h('small', { class: 'sv-badge' }, t('sv_backupBadge')) : null),
  ];
  return onClick ? h('button', { class: 'card sv-card', onClick }, body) : h('div', { class: 'card sv-card' }, body);
}

// ---------------------------------------------------------------- sauvegarder

/** Partage de fichiers possible (iPhone : Enregistrer dans Fichiers, AirDrop, mail…) ; sur ordinateur, on télécharge. */
function canShareFile(file) {
  try {
    return typeof navigator.share === 'function' && Boolean(navigator.canShare?.({ files: [file] }))
      && matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * « 💾 Sauvegarder ma partie ». ids : les parties proposées ; checked : celles cochées au départ.
 * live : la partie en cours, prise telle qu'en mémoire (quand l'appareil n'a pas pu l'écrire : stockage plein).
 * Le fichier est fait et partagé dans le tap sur « Sauvegarder » (le partage de Safari l'exige).
 */
export function openExport(ui, { ids, checked = ids, live = null } = {}) {
  const store = deviceStore();
  const load = (id) => (live?.id === id ? JSON.parse(JSON.stringify(live)) : store.load(id));
  let entries = store.list().filter((e) => ids.includes(e.id));
  if (live && !entries.some((e) => e.id === live.id)) entries = [{ id: live.id, name: live.name }, ...entries];
  if (!entries.length) {
    ui.toast(t('saveFailed'), 6000);
    return;
  }
  const sel = new Set(entries.filter((e) => checked.includes(e.id)).map((e) => e.id));
  const show = sheet(ui);
  const shareable = canShareFile(new File(['{}'], `x${FILE_EXT}`, { type: FILE_MIME }));
  let shareFailed = false;
  let saveBtn = null;

  const save = (forceDownload = false) => {
    const profiles = entries.filter((e) => sel.has(e.id)).map((e) => load(e.id)).filter(Boolean);
    if (!profiles.length) return;
    const name = saveFileName(profiles, { manyLabel: (n) => t('sv_many', { n }) });
    const file = new File([serializeSave(profiles, { appVersion: appVersion() })], name, { type: FILE_MIME });
    if (!forceDownload && !shareFailed && canShareFile(file)) {
      navigator.share({ files: [file] }).then(() => {
        ui.hideModal();
        ui.toast(t('sv_shared'), 4500);
      }).catch((err) => {
        if (err?.name === 'AbortError') return; // fenêtre de partage fermée : on reste ici, rien n'est perdu
        shareFailed = true; // le tap suivant (« Télécharger ») est un nouveau geste : le téléchargement passera
        draw();
      });
      return;
    }
    download(file, name);
    ui.hideModal();
    ui.toast(t('sv_downloaded', { file: name }), 6000);
  };

  const pickList = () => h('div', { class: 'sv-pick' }, entries.map((e) => {
    const p = load(e.id);
    const s = p ? profileSummary(p) : null;
    return h('label', { class: 'check sv-check' },
      h('input', {
        type: 'checkbox',
        checked: sel.has(e.id),
        onChange: (ev) => {
          if (ev.target.checked) sel.add(e.id);
          else sel.delete(e.id);
          if (saveBtn) saveBtn.disabled = !sel.size;
        },
      }),
      h('span', {},
        h('b', {}, e.name),
        s ? h('small', {}, `⭐ ${t('level', { n: s.level })} · ${s.animals ? t('animalsCount', { n: s.animals }) : t('sv_animals0')}`) : null,
        e.backup ? h('small', { class: 'sv-badge' }, t('sv_backupBadge')) : null));
  }));

  const draw = () => {
    saveBtn = shareFailed
      ? h('button', { class: 'primary', onClick: () => save(true) }, `⬇️ ${t('sv_download')}`)
      : h('button', { class: 'primary', disabled: !sel.size, onClick: () => save() }, `💾 ${t('sv_saveBtn')}`);
    const one = entries.length === 1 ? load(entries[0].id) : null;
    show([
      h('h2', { class: 'sv-title' }, `💾 ${t(entries.length > 1 ? 'sv_saveMany' : 'sv_save')}`),
      entries.length > 1 ? [h('h3', {}, t('sv_pick')), pickList()] : one ? summaryCard(profileSummary(one)) : null,
      h('p', { class: 'note sv-help' }, t('sv_help')),
      shareFailed ? h('p', { class: 'warn' }, t('sv_shareFailed')) : null,
      shareable && !shareFailed ? h('button', { class: 'link-btn', onClick: () => save(true) }, `⬇️ ${t('sv_downloadInstead')}`) : null,
      h('div', { class: 'row end' }, h('button', { onClick: () => ui.hideModal() }, t('cancel')), saveBtn),
    ]);
  };
  draw();
}

// ---------------------------------------------------------------- restaurer

let fileInput = null;

const readText = (file) => (typeof file.text === 'function' ? file.text() : new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error);
  r.readAsText(file);
}));

/**
 * « 📂 Restaurer une partie » : ouvre le choix du fichier. À appeler dans le tap (sinon Safari ne l'ouvre pas).
 * Le champ reste dans la page (caché) : sur iPhone, un champ détaché ne prévient pas toujours du fichier choisi.
 */
export function pickRestoreFile(ui) {
  if (!fileInput?.isConnected) {
    fileInput = h('input', { type: 'file', accept: `${FILE_EXT},${FILE_MIME}`, class: 'sv-file', tabindex: '-1', 'aria-hidden': 'true' });
    document.body.append(fileInput);
  }
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      await restoreFromFile(ui, file);
    } finally {
      fileInput.value = ''; // le même fichier pourra être choisi à nouveau
    }
  };
  fileInput.value = '';
  fileInput.click();
}

/** Lit et vérifie le fichier, puis montre l'aperçu (ou un message clair si le fichier ne va pas). */
export async function restoreFromFile(ui, file) {
  const show = sheet(ui);
  if (file.size > MAX_FILE_BYTES) return showError(show, ui, t('sv_err_tooBig'));
  let text;
  try {
    text = await readText(file);
  } catch {
    return showError(show, ui, t('sv_err_read'));
  }
  const parsed = parseSave(text);
  if (!parsed.ok) return showError(show, ui, t(`sv_err_${parsed.error}`));
  restoreFlow(ui, parsed, show);
}

function showError(show, ui, msg, nothingChanged = true) {
  show([
    h('h2', { class: 'sv-title' }, `😕 ${t('sv_err_title')}`),
    h('p', {}, msg),
    nothingChanged ? h('p', { class: 'note' }, t('sv_nothingChanged')) : null,
    h('div', { class: 'row end' }, h('button', { class: 'primary', onClick: () => ui.hideModal() }, 'OK')),
  ]);
}

/** Aperçu, puis : ajouter comme nouveau profil, ou remplacer un profil (après confirmation, copie de secours d'abord). */
function restoreFlow(ui, parsed, show) {
  const store = deviceStore();
  const g = ui.game;
  const files = parsed.profiles;
  const close = () => ui.hideModal();
  const back = (fn) => h('button', { onClick: fn }, `← ${t('sv_back')}`);
  // L'écran des profils (s'il est affiché) montre tout de suite la partie ajoutée.
  const refreshScreen = () => { if (!g?.running) ui.showProfiles(); };
  const meta = [
    parsed.meta.exportedAt ? t('sv_fileFrom', { date: fmtDate(parsed.meta.exportedAt) }) : null,
    parsed.meta.appVersion ? t('sv_fileVersion', { v: parsed.meta.appVersion }) : null,
  ].filter(Boolean).join(' · ');
  const header = () => [
    h('h2', { class: 'sv-title' }, `📂 ${t('sv_restore')}`),
    meta ? h('p', { class: 'note sv-meta' }, meta) : null,
  ];

  const pick = () => show([
    header(),
    h('p', {}, t('sv_choose')),
    h('div', { class: 'cards' }, files.map((p) => summaryCard(profileSummary(p), { onClick: () => choose(p) }))),
    h('button', { class: 'big', onClick: addAll }, `➕ ${t('sv_addAll', { n: files.length })}`),
    h('div', { class: 'row end' }, h('button', { onClick: close }, t('cancel'))),
  ]);

  const choose = (p) => {
    const local = store.list();
    const same = local.find((e) => e.id === p.id);
    const here = same ? store.load(same.id) : null;
    const cmp = here ? compareProfiles(p, here) : null;
    const others = local.filter((e) => e.id !== p.id).length;
    show([
      header(),
      summaryCard(profileSummary(p)),
      here ? h('p', { class: cmp === 'older' ? 'warn' : 'note sv-same' },
        `${t('sv_sameHere')} ${t({ newer: 'sv_fileNewer', older: 'sv_fileOlder', same: 'sv_fileSame' }[cmp])}`) : null,
      h('h3', {}, t('sv_what')),
      h('div', { class: 'sv-actions' },
        here ? h('button', { class: cmp === 'older' ? 'big' : 'primary big', onClick: () => confirmReplace(p, here.id) },
          `🔁 ${t('sv_replaceThis', { name: here.name })}`) : null,
        h('button', { class: here && cmp !== 'older' ? 'big' : 'primary big', onClick: () => addNew(p) }, `➕ ${t('sv_addNew')}`),
        others ? h('button', { class: 'big', onClick: () => replaceWhich(p) }, `🔁 ${t('sv_replace')}`) : null),
      h('div', { class: 'row end' }, files.length > 1 ? back(pick) : null, h('button', { onClick: close }, t('cancel'))),
    ]);
  };

  const replaceWhich = (p) => show([
    header(),
    h('p', {}, t('sv_replaceWhich')),
    h('div', { class: 'cards' }, store.list().map((e) => {
      const lp = store.load(e.id);
      return lp ? summaryCard(profileSummary(lp), { onClick: () => confirmReplace(p, e.id) }) : null;
    })),
    h('div', { class: 'row end' }, back(() => choose(p))),
  ]);

  const confirmReplace = (p, targetId) => {
    const old = store.load(targetId);
    if (!old) return choose(p);
    const older = compareProfiles(p, old) === 'older';
    show([
      h('h2', { class: 'sv-title' }, `🔁 ${t('sv_confirmReplace', { old: old.name })}`),
      h('div', { class: 'sv-compare' },
        h('h3', {}, t('sv_onDevice')), summaryCard(profileSummary(old)),
        h('div', { class: 'sv-arrow', 'aria-hidden': 'true' }, '⬇️'),
        h('h3', {}, t('sv_inFile')), summaryCard(profileSummary(p))),
      older ? h('p', { class: 'warn' }, t('sv_fileOlder')) : null,
      h('p', { class: 'sv-safe' }, t('sv_backupNote', { backup: backupNameOf(old) })),
      h('div', { class: 'row end' },
        back(() => choose(p)),
        h('button', { class: 'danger', onClick: () => doReplace(p, targetId) }, `🔁 ${t('sv_replaceBtn')}`)),
    ]);
  };

  const doReplace = (p, targetId) => {
    // La partie en cours est remplacée : on la sauvegarde et on l'arrête d'abord (sinon elle réécrirait
    // par-dessus en quittant) ; la copie de secours a ainsi son tout dernier état.
    if (g?.running && g.profile?.id === targetId) {
      g.stop();
      ui.closePanel();
      ui.showProfiles();
    }
    const r = restoreReplace(store, targetId, p, { backupName: backupNameOf });
    refreshScreen();
    if (!r.ok) return showError(show, ui, t('sv_storageFull'), !r.backup);
    done(r.profile, t('sv_doneReplaced', { name: r.profile.name, backup: r.backup.name }));
  };

  const addNew = (p) => {
    const r = restoreAsNew(store, p);
    refreshScreen();
    if (!r.ok) return showError(show, ui, t('sv_storageFull'));
    done(r.profile, t('sv_doneAdded', { name: r.profile.name }));
  };

  function addAll() {
    let n = 0;
    // À l'envers : chaque partie ajoutée passe en haut de la liste, qui garde ainsi l'ordre du fichier.
    for (const p of [...files].reverse()) {
      if (!restoreAsNew(store, p).ok) break;
      n++;
    }
    refreshScreen();
    if (n < files.length) return showError(show, ui, n ? t('sv_storagePartial', { done: n, n: files.length }) : t('sv_storageFull'), !n);
    done(null, t('sv_doneAddedMany', { n }));
  }

  const play = (id) => {
    close();
    if (g?.running) {
      g.stop();
      ui.closePanel();
      ui.showProfiles();
    }
    const prof = loadProfile(id);
    if (prof) g.start(prof);
  };

  const done = (profile, msg) => show([
    h('h2', { class: 'sv-title' }, t('sv_done')),
    h('p', {}, msg),
    profile ? summaryCard(profileSummary(profile)) : null,
    h('div', { class: 'sv-actions' },
      profile ? h('button', { class: 'primary big', onClick: () => play(profile.id) }, `▶ ${t('sv_play', { name: profile.name })}`) : null,
      files.length > 1 ? h('button', { class: 'big', onClick: pick }, `📂 ${t('sv_other')}`) : null),
    h('div', { class: 'row end' }, h('button', { onClick: close }, 'OK')),
  ]);

  if (files.length > 1) pick();
  else choose(files[0]);
}
