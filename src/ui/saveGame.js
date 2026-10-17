// « 💾 Sauvegarder ma partie » et « 📂 Restaurer une partie » : la partie dans un fichier, pour changer
// d'appareil (téléphone → ordinateur) ou d'adresse du jeu (chaque adresse a ses propres sauvegardes).
// Ici l'interface ; vérifier, fusionner et garder une copie de secours : src/sim/saveFile.js et src/sim/saveStore.js.

import { h } from './dom.js';
import { t, getLang } from '../i18n.js';
import {
  serializeSave, parseSave, saveFileName, profileSummary, compareProfiles, sameContent, uniqueName, MAX_FILE_BYTES, FILE_MIME, FILE_EXT,
} from '../sim/saveFile.js';
import { deviceStore, restoreAsNew, restoreReplace } from '../sim/saveStore.js';
import { loadProfile } from '../sim/profile.js';
import { checkForUpdate } from './updates.js';

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

/** Pendant un trajet suivi, Game.save garde la sauvegarde d'avant le départ (pas un voyage à moitié fait). */
const travelling = (g) => Boolean(g?.tripFlow?.journey && !g.tripFlow.journey.report);

/**
 * Fenêtre en plusieurs étapes, dans un seul conteneur (.sv-sheet) donné une fois à ui.showModal : chaque
 * étape remplace son contenu, qu'il soit affiché ou encore en attente (ui.showModal met en attente une
 * fenêtre demandée pendant qu'une autre est ouverte : naissance, client, orage…). Une fenêtre en attente
 * montrera ainsi toujours la dernière étape, et chaque étape n'est faite qu'une fois.
 */
function sheet(ui) {
  const root = h('div', { class: 'sv-sheet' });
  return (content) => {
    root.replaceChildren(...[content].flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
    const box = root.parentElement;
    if (ui.modalOpen && box && ui.modal.contains(box)) {
      box.scrollTop = 0;
      return;
    }
    if (ui.modalQueue.includes(root)) return; // en attente : elle sortira avec ce contenu
    ui.showModal(root);
  };
}

/**
 * Bouton d'une action qui écrit sur l'appareil (ajouter, remplacer) : au premier tap, tous les boutons de la
 * fenêtre se grisent, pour qu'un double tap ne fasse pas deux fois la même chose.
 */
const once = (fn) => (ev) => {
  const root = ev?.currentTarget?.closest?.('.sv-sheet');
  for (const b of root?.querySelectorAll('button') ?? []) b.disabled = true;
  fn();
};

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
  if (!parsed.ok) {
    // Version plus récente : on peut chercher la mise à jour d'ici (l'écran des profils n'a pas de Réglages).
    return showError(show, ui, t(`sv_err_${parsed.error}`), { extra: parsed.error === 'tooNew' ? updateButton(ui) : null });
  }
  restoreFlow(ui, parsed, show);
}

/** « 🔄 Rechercher une mise à jour », comme dans les Réglages (src/ui/updates.js : bandeau « Recharger » si prête). */
function updateButton(ui) {
  return h('button', {
    class: 'primary big',
    onClick: async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      const r = await checkForUpdate();
      b.disabled = false;
      if (r === 'ready') ui.hideModal(); // le bandeau « Nouvelle version prête · Recharger » est affiché
      else ui.toast(t(r === 'none' ? 'sv_updateNone' : 'updateUnavailable'), 7000);
    },
  }, `🔄 ${t('updateCheck')}`);
}

/**
 * Fenêtre « ça n'a pas marché ». opts : title (clé du titre : fichier qui ne va pas, par défaut, ou appareil
 * plein), nothingChanged (oui par défaut : on le dit), extra (boutons de plus, au-dessus de OK).
 */
function showError(show, ui, msg, { title = 'sv_err_title', nothingChanged = true, extra = null } = {}) {
  show([
    h('h2', { class: 'sv-title' }, `${title === 'sv_full_title' ? '📱' : '😕'} ${t(title)}`),
    h('p', {}, msg),
    nothingChanged ? h('p', { class: 'note' }, t('sv_nothingChanged')) : null,
    extra ? h('div', { class: 'sv-actions' }, extra) : null,
    // Avec un bouton de plus (💾, 🔄), c'est lui le bouton principal ; OK ferme seulement.
    h('div', { class: 'row end' }, h('button', { class: extra ? '' : 'primary', onClick: () => ui.hideModal() }, 'OK')),
  ]);
}

/** Appareil plein : le titre le dit (le fichier, lui, est bon). */
const showFull = (show, ui, msg, opts = {}) => showError(show, ui, msg, { ...opts, title: 'sv_full_title' });

/** Aperçu, puis : ajouter comme nouveau profil, ou remplacer un profil (après confirmation, copie de secours d'abord). */
function restoreFlow(ui, parsed, show) {
  const store = deviceStore();
  const g = ui.game;
  const files = parsed.profiles;
  const close = () => ui.hideModal();
  const back = (fn) => h('button', { onClick: fn }, `← ${t('sv_back')}`);
  // L'écran des profils (s'il est affiché) montre tout de suite la partie ajoutée.
  const refreshScreen = () => { if (!g?.running) ui.showProfiles(); };
  // La partie en cours, telle qu'en mémoire : c'est elle qu'on compare au fichier, pas sa dernière sauvegarde
  // (la sauvegarde automatique ne passe que de temps en temps, et plus du tout quand l'appareil est plein).
  // Pendant un trajet, la partie écrite (d'avant le départ) est celle qui serait gardée en copie de secours.
  const playing = () => (g?.running && g.profile && !travelling(g) ? g.profile : null);
  const loadHere = (id) => (playing()?.id === id ? JSON.parse(JSON.stringify(playing())) : store.load(id));
  const backupLabel = (old) => uniqueName(backupNameOf(old), store.list().map((e) => e.name));
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
    h('button', { class: 'big', onClick: once(addAll) }, `➕ ${t('sv_addAll', { n: files.length })}`),
    h('div', { class: 'row end' }, h('button', { onClick: close }, t('cancel'))),
  ]);

  const choose = (p) => {
    const local = store.list();
    const here = local.some((e) => e.id === p.id) ? loadHere(p.id) : null;
    const cmp = here ? compareProfiles(p, here) : null;
    // Exactement la même partie (même date, même contenu) : rien à faire, c'est le bouton principal.
    const identical = cmp === 'same' && sameContent(p, here);
    const others = local.filter((e) => e.id !== p.id).length;
    // Bouton principal : remplacer seulement si le fichier est plus récent ; sinon ajouter (rien n'est écrasé).
    const main = identical ? 'ok' : cmp === 'newer' ? 'replace' : 'add';
    const note = identical ? 'sv_identical' : { newer: 'sv_fileNewer', older: 'sv_fileOlder', same: 'sv_fileSameDate' }[cmp];
    show([
      header(),
      summaryCard(profileSummary(p)),
      here ? h('p', { class: cmp === 'older' ? 'warn' : 'note sv-same' }, `${t('sv_sameHere')} ${t(note)}`) : null,
      identical ? h('div', { class: 'sv-actions' }, h('button', { class: 'primary big', onClick: close }, `👍 ${t('sv_nothingToDo')}`)) : null,
      h('h3', {}, t(identical ? 'sv_anyway' : 'sv_what')),
      h('div', { class: 'sv-actions' },
        here ? h('button', { class: main === 'replace' ? 'primary big' : 'big', onClick: () => confirmReplace(p, here.id) },
          `🔁 ${t('sv_replaceThis', { name: here.name })}`) : null,
        h('button', { class: main === 'add' ? 'primary big' : 'big', onClick: once(() => addNew(p)) }, `➕ ${t('sv_addNew')}`),
        others ? h('button', { class: 'big', onClick: () => replaceWhich(p) }, `🔁 ${t('sv_replace')}`) : null),
      // Même partie : « OK, rien à faire » ferme déjà la fenêtre (pas de rangée Annuler vide).
      files.length > 1 || !identical
        ? h('div', { class: 'row end' }, files.length > 1 ? back(pick) : null, identical ? null : h('button', { onClick: close }, t('cancel')))
        : null,
    ]);
  };

  const replaceWhich = (p) => show([
    header(),
    h('p', {}, t('sv_replaceWhich')),
    h('div', { class: 'cards' }, store.list().map((e) => {
      const lp = loadHere(e.id);
      return lp ? summaryCard(profileSummary(lp), { onClick: () => confirmReplace(p, e.id) }) : null;
    })),
    h('div', { class: 'row end' }, back(() => choose(p))),
  ]);

  const confirmReplace = (p, targetId) => {
    const old = loadHere(targetId);
    if (!old) return choose(p);
    const older = compareProfiles(p, old) === 'older';
    show([
      h('h2', { class: 'sv-title' }, `🔁 ${t('sv_confirmReplace', { old: old.name })}`),
      h('div', { class: 'sv-compare' },
        h('h3', {}, t('sv_onDevice')), summaryCard(profileSummary(old)),
        h('div', { class: 'sv-arrow', 'aria-hidden': 'true' }, '⬇️'),
        h('h3', {}, t('sv_inFile')), summaryCard(profileSummary(p))),
      older ? h('p', { class: 'warn' }, t('sv_fileOlder')) : null,
      h('p', { class: 'sv-safe' }, t('sv_backupNote', { backup: backupLabel(old) })),
      h('div', { class: 'row end' },
        back(() => choose(p)),
        h('button', { class: 'danger', onClick: once(() => doReplace(p, targetId)) }, `🔁 ${t('sv_replaceBtn')}`)),
    ]);
  };

  const doReplace = (p, targetId) => {
    const current = Boolean(g?.running && g.profile?.id === targetId);
    // La partie en cours est remplacée : on l'écrit d'abord, pour que la copie de secours ait son tout dernier
    // état. Si l'appareil est plein, on ne touche à rien (la partie continue, rien de ce qui est en mémoire
    // n'est perdu) et on propose de la mettre dans un fichier.
    if (current && !travelling(g) && !g.save()) {
      return showFull(show, ui, t('sv_fullPlaying'), {
        extra: h('button', {
          class: 'primary big',
          onClick: () => {
            const live = g.running ? g.profile : null;
            ui.hideModal();
            if (live) openExport(ui, { ids: [live.id], live });
          },
        }, `💾 ${t('sv_save')}`),
      });
    }
    const r = restoreReplace(store, targetId, p, {
      backupName: backupNameOf,
      // La copie de secours est écrite : la partie en cours s'arrête avant qu'on écrive par-dessus (en se
      // fermant, elle réécrirait sinon l'ancienne version).
      afterBackup: current ? () => {
        g.stop();
        ui.closePanel();
        ui.showProfiles();
      } : null,
    });
    refreshScreen();
    if (!r.ok) {
      const old = r.backup ? t('sv_backupKept', { backup: r.backup.name }) : '';
      return showFull(show, ui, `${t('sv_storageFull')} ${old}`.trim(), { nothingChanged: !r.backup });
    }
    done(r.profile, t('sv_doneReplaced', { name: r.profile.name, backup: r.backup.name }));
  };

  const addNew = (p) => {
    const r = restoreAsNew(store, p);
    refreshScreen();
    if (!r.ok) return showFull(show, ui, t('sv_storageFull'));
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
    if (n < files.length) return showFull(show, ui, n ? t('sv_storagePartial', { done: n, n: files.length }) : t('sv_storageFull'), { nothingChanged: !n });
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
