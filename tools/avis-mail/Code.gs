// 📧 Un mail à chaque nouvel avis des joueurs (« 💌 Ton avis » du jeu : src/cloud/feedback.js).
//
// Un script Google Apps Script à coller UNE fois dans https://script.google.com, avec le compte Google propriétaire
// du projet Firebase « lafermeamadichelle » (pas à pas : docs/HEBERGEMENT.md, « Recevoir un mail à chaque avis »).
// Gratuit, sans carte bancaire, sans mot de passe ni adresse dans le code : le mail part de ton Gmail vers toi-même.
//
// Toutes les heures, verifierLesAvis lit les avis arrivés depuis le dernier mail (collection « feedback », par l'API
// de Firestore, avec tes droits Google : les règles de firestore.rules, qui interdisent de les lire, ne valent que
// pour le jeu) et envoie UN mail récapitulatif s'il y a du neuf (PAR_PASSAGE avis au plus : la suite au passage
// suivant). Rien de neuf : pas de mail. Le script ne fait que lire : il n'écrit, ne change ni n'efface rien.
// Erreur (réseau, droits, réponse illisible, mail refusé) : pas de mail d'avis, le repère « dernier vu » ne bouge pas,
// on réessaie l'heure suivante (rien n'est perdu) ; après ALERTE_APRES échecs de suite, UN mail d'alerte (pas un par
// heure), et plus rien jusqu'à ce que la lecture remarche.
//
// Les fonctions à lancer (menu en haut de l'éditeur, à côté de « Déboguer », puis « Exécuter ») :
//   installer        le passage toutes les heures (un seul, même installé deux fois) et un premier passage tout de suite
//   essai            un mail d'essai : dit si le mail marche, si la lecture des avis marche, si c'est installé
//   desinstaller     arrête les passages (le repère est gardé : réinstallé, il reprend là où il s'était arrêté)
//   verifierLesAvis  le passage horaire lui-même (on peut aussi le lancer à la main)
// Les fonctions qui finissent par « _ » sont internes : Apps Script ne les montre pas dans ce menu.
//
// JavaScript « V8 » d'Apps Script, sans import. Tests : tests/avis-mail.test.js (dans node, avec de faux services
// Google ; et la vraie requête dans l'émulateur Firestore).

const PROJET = 'lafermeamadichelle';
const COLLECTION = 'feedback';
const PAR_PASSAGE = 50; // avis au plus par mail (la suite au passage suivant)
const ALERTE_APRES = 6; // échecs de suite (un par heure) avant le mail d'alerte
const FUSEAU = 'Europe/Zurich';
const EXPEDITEUR = 'La ferme à Madichelle'; // (le nom affiché ; l'adresse est la tienne)
const FIRESTORE = 'https://firestore.googleapis.com/v1';
const DOCUMENTS = `projects/${PROJET}/databases/(default)/documents`;
const CONSOLE = `https://console.firebase.google.com/project/${PROJET}/firestore/databases/-default-/data/~2F${COLLECTION}`;
const PASSAGE = 'verifierLesAvis'; // (la fonction lancée toutes les heures)

// Ce que le script retient (Propriétés du script) : le dernier avis envoyé, et les échecs de suite.
const CLES = {
  repere: 'avisMail.repere', // { t: createdAt tel que Firestore l'écrit (à la microseconde), nom: le document }
  echecs: 'avisMail.echecs',
  premierEchec: 'avisMail.premierEchec',
  alerte: 'avisMail.alerte', // le mail d'alerte de cette série d'échecs est parti
};

/** Les champs d'un avis (src/cloud/feedback.js, FIELDS) et son heure d'arrivée. */
const CHAMPS = ['text', 'mood', 'kind', 'lang', 'version', 'device', 'orientation', 'mode', 'level', 'day', 'place',
  'screen', 'createdAt'];

const SMILEYS = { love: '😍', happy: '🙂', meh: '😐', sad: '😕', none: '💬' };
const SORTES = { idea: '💡 Idée', bug: '🐞 Bug', like: '❤️ J\'aime', other: '✉️ Autre' };
const LANGUES = { fr: 'français', en: 'anglais' };
const APPAREILS = { phone: 'téléphone', tablet: 'tablette', computer: 'ordinateur' };
const SENS = { portrait: 'portrait', landscape: 'paysage' };
const MODES = { sandbox: 'bac à sable', manage: 'gestion', none: 'écran des profils' };

// ---------------------------------------------------------------- les fonctions à lancer

/** Installe le passage toutes les heures (une seule fois) et fait un premier passage tout de suite. */
function installer() {
  const deja = declencheurs_();
  if (!deja.length) {
    ScriptApp.newTrigger(PASSAGE).timeBased().everyHours(1).create();
    Logger.log('Installé : les avis seront vérifiés toutes les heures.');
  } else {
    deja.slice(1).forEach((t) => ScriptApp.deleteTrigger(t)); // (un seul passage horaire, même installé plusieurs fois)
    Logger.log('Déjà installé : les avis sont vérifiés toutes les heures.');
  }
  const r = verifierLesAvis();
  if (r.etat === 'erreur') {
    throw new Error(`Installé, mais la lecture des avis ne marche pas encore : ${r.erreur}. Voir docs/HEBERGEMENT.md, `
      + '« Recevoir un mail à chaque avis ».');
  }
  return r;
}

/** Le passage horaire : un mail s'il y a de nouveaux avis, rien sinon. Ne lève jamais d'erreur (voir echec_). */
function verifierLesAvis() {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(30000)) {
    Logger.log('Un autre passage est en cours : rien à faire.');
    return { etat: 'occupe' };
  }
  try {
    return passage_(PropertiesService.getScriptProperties());
  } finally {
    verrou.releaseLock();
  }
}

/** Arrête les passages horaires. Le repère est gardé : réinstallé, le script reprend là où il s'était arrêté. */
function desinstaller() {
  const ts = declencheurs_();
  ts.forEach((t) => ScriptApp.deleteTrigger(t));
  const props = PropertiesService.getScriptProperties();
  [CLES.echecs, CLES.premierEchec, CLES.alerte].forEach((k) => props.deleteProperty(k));
  Logger.log(ts.length ? 'Désinstallé : plus de vérification des avis, plus de mail.' : 'Rien à désinstaller.');
  return ts.length;
}

/**
 * Un mail d'essai (à toi-même) : il dit si la lecture des avis marche (sans rien envoyer d'autre ni bouger le repère)
 * et si le passage horaire est installé. Mail refusé : erreur (rouge dans le journal d'exécution).
 */
function essai() {
  let lecture;
  try {
    lecture = { ok: true, n: chercherLesAvis_(lireRepere_(PropertiesService.getScriptProperties()), PAR_PASSAGE).length };
  } catch (err) {
    lecture = { ok: false, erreur: messageDe_(err) };
  }
  envoyer_(mailEssai_(lecture, declencheurs_().length > 0));
  Logger.log(`Mail d'essai envoyé. Lecture des avis : ${lecture.ok ? 'elle marche' : `elle ne marche pas (${lecture.erreur})`}.`);
  return lecture;
}

// ---------------------------------------------------------------- le passage

function passage_(props) {
  const repere = lireRepere_(props);
  let avis;
  try {
    avis = chercherLesAvis_(repere, PAR_PASSAGE);
    if (avis.length) envoyer_(texteDuMail_(avis, { plein: avis.length >= PAR_PASSAGE }));
  } catch (err) {
    return echec_(props, err); // (repère inchangé : on réessaie l'heure suivante)
  }
  // Le mail est parti (ou il n'y avait rien) : seulement maintenant, le repère avance.
  const suivant = repereApres_(avis);
  if (suivant) props.setProperty(CLES.repere, JSON.stringify(suivant));
  const echecs = Number(props.getProperty(CLES.echecs)) || 0;
  [CLES.echecs, CLES.premierEchec, CLES.alerte].forEach((k) => props.deleteProperty(k));
  if (echecs) Logger.log(`La lecture des avis remarche (après ${echecs} échec${echecs > 1 ? 's' : ''}).`);
  Logger.log(avis.length ? `${nombreDAvis_(avis.length)} : mail envoyé.` : 'Aucun nouvel avis : pas de mail.');
  return { etat: avis.length ? 'envoye' : 'rien', n: avis.length };
}

/** Un échec de plus : noté (et dit dans le journal) ; UN mail d'alerte quand la série atteint ALERTE_APRES. */
function echec_(props, err) {
  const message = messageDe_(err);
  const echecs = (Number(props.getProperty(CLES.echecs)) || 0) + 1;
  props.setProperty(CLES.echecs, String(echecs));
  if (!props.getProperty(CLES.premierEchec)) props.setProperty(CLES.premierEchec, maintenant_().toISOString());
  Logger.log(`Avis pas lus (échec ${echecs} de suite) : ${message}. On réessaie dans une heure.`);
  let alerte = false;
  if (echecs >= ALERTE_APRES && !props.getProperty(CLES.alerte)) {
    try {
      envoyer_(mailAlerte_(echecs, props.getProperty(CLES.premierEchec), message));
      props.setProperty(CLES.alerte, 'oui');
      alerte = true;
    } catch (e) {
      Logger.log(`Le mail d'alerte n'est pas parti : ${messageDe_(e)}`); // (réessayé au prochain échec)
    }
  }
  return { etat: 'erreur', erreur: message, echecs, alerte };
}

/** Les avis arrivés après le repère (PAR_PASSAGE au plus), du plus ancien au plus récent. Erreur : lève une erreur. */
function chercherLesAvis_(repere, limite) {
  const r = requete_(repere, ScriptApp.getOAuthToken(), limite);
  const reponse = UrlFetchApp.fetch(r.url, r.params);
  return lireReponse_(reponse.getResponseCode(), reponse.getContentText());
}

function envoyer_(mail) {
  const moi = Session.getEffectiveUser().getEmail();
  if (!moi) throw new Error('adresse e-mail du compte introuvable (autorisation « voir votre adresse e-mail » refusée ?)');
  const m = { to: moi, subject: mail.sujet, body: mail.texte, name: EXPEDITEUR };
  if (mail.html) m.htmlBody = mail.html;
  MailApp.sendEmail(m);
}

const declencheurs_ = () => ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === PASSAGE);

function maintenant_() {
  return new Date();
}

function lireRepere_(props) {
  try {
    const r = JSON.parse(props.getProperty(CLES.repere) || 'null');
    return r && typeof r.t === 'string' && r.t && typeof r.nom === 'string' && r.nom ? { t: r.t, nom: r.nom } : null;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------- la requête et la réponse (calcul seul)

/**
 * Le corps de la requête runQuery : les avis rangés par heure d'arrivée (createdAt, croissant), puis par nom de
 * document (deux avis arrivés à la même microseconde gardent un ordre fixe), limite au plus. Avec un repère : filtre
 * createdAt ≥ celui du dernier avis vu, et départ JUSTE APRÈS lui (startAt, before: false, sur l'heure ET le nom) :
 * jamais deux fois le même avis, et aucun oublié, même quand la limite tombe entre deux avis de la même heure.
 * Sans repère (le tout premier passage) : depuis le premier avis.
 */
function corpsDeLaRequete_(repere, limite) {
  const q = {
    from: [{ collectionId: COLLECTION }],
    orderBy: [
      { field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' },
      { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
    ],
    limit: limite || PAR_PASSAGE,
  };
  if (repere && repere.t && repere.nom) {
    q.where = {
      fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: repere.t } },
    };
    q.startAt = { values: [{ timestampValue: repere.t }, { referenceValue: repere.nom }], before: false };
  }
  return { structuredQuery: q };
}

/**
 * La requête complète (adresse et paramètres de UrlFetchApp.fetch) : jeton OAuth du compte (portée datastore), et
 * x-goog-user-project : c'est le projet Firebase qui sert l'API (sinon Google cherche Firestore dans le petit projet
 * caché du script, où il n'est pas activé). Réponse lue même en cas d'erreur (muteHttpExceptions).
 */
function requete_(repere, jeton, limite) {
  return {
    url: `${FIRESTORE}/${DOCUMENTS}:runQuery`,
    params: {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(corpsDeLaRequete_(repere, limite)),
      headers: { Authorization: `Bearer ${jeton}`, 'x-goog-user-project': PROJET },
      muteHttpExceptions: true,
    },
  };
}

/** Une valeur de l'API REST de Firestore ({ stringValue: … }, { integerValue: '4' }…) ; null si absente ou inconnue. */
function valeur_(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return String(v.stringValue);
  if ('integerValue' in v || 'doubleValue' in v) {
    const n = Number('integerValue' in v ? v.integerValue : v.doubleValue);
    return Number.isFinite(n) ? n : null;
  }
  if ('timestampValue' in v) return String(v.timestampValue); // (tel quel : à la microseconde, pour le repère)
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  return null;
}

/** Un document Firestore (REST) → un avis : { nom, id, text, mood, …, createdAt } (null pour ce qui manque). */
function lireAvis_(doc) {
  const champs = (doc && doc.fields) || {};
  const nom = String((doc && doc.name) || '');
  const avis = { nom, id: nom.split('/').pop() };
  CHAMPS.forEach((k) => {
    avis[k] = Object.prototype.hasOwnProperty.call(champs, k) ? valeur_(champs[k]) : null;
  });
  return avis;
}

/** La réponse de runQuery → les avis, dans l'ordre. HTTP autre que 200, erreur ou réponse illisible : lève une erreur. */
function lireReponse_(code, texte) {
  let json = null;
  try {
    json = JSON.parse(texte);
  } catch (e) {
    json = null;
  }
  const erreur = Array.isArray(json) ? (json.filter((x) => x && x.error)[0] || {}).error : json && json.error;
  if (code !== 200 || erreur || !Array.isArray(json)) {
    const detail = erreur ? [erreur.status, erreur.message].filter(Boolean).join(' : ')
      : (code === 200 ? 'réponse illisible' : texte);
    throw new Error(`Firestore a répondu ${code}${ligne_(detail, 300) ? ` (${ligne_(detail, 300)})` : ''}`);
  }
  return json.filter((x) => x && x.document).map((x) => lireAvis_(x.document));
}

/** Le repère après ces avis : le dernier qui a une heure d'arrivée (null : le repère ne bouge pas). */
function repereApres_(avis) {
  const avecHeure = avis.filter((a) => typeof a.createdAt === 'string' && a.createdAt && a.nom);
  const dernier = avecHeure[avecHeure.length - 1];
  return dernier ? { t: dernier.createdAt, nom: dernier.nom } : null;
}

// ---------------------------------------------------------------- les mails (calcul seul)

// Ce qui ne s'affiche pas : caractères de contrôle (le retour à la ligne reste), invisibles, changements de sens
// d'écriture (un texte écrit hors du jeu pourrait s'en servir pour brouiller le mail).
const INVISIBLES = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u00AD\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;

/** Coupé à max caractères (sans moitié d'emoji). */
const couper_ = (s, max) => (s.length > max ? s.slice(0, max).replace(/[\uD800-\uDBFF]$/, '') : s);

/** Un texte sur plusieurs lignes (le message d'un enfant), nettoyé et borné. */
function texte_(s, max) {
  const t = String(s === null || s === undefined ? '' : s)
    .replace(/\r\n?|[\u2028\u2029]/g, '\n').replace(/\t/g, ' ').replace(INVISIBLES, '')
    .replace(/[ ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return couper_(t, max);
}

/** Un texte sur une seule ligne (version, lieu, écran, message d'erreur…), nettoyé et borné. */
const ligne_ = (s, max) => couper_(texte_(s, 4 * max).replace(/\s+/g, ' '), max);

const echapper_ = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Une valeur connue dite en clair (table) ; une valeur inconnue (écrite hors du jeu) telle quelle, nettoyée. */
function dire_(table, v) {
  if (v === null || v === undefined || v === '') return '';
  return Object.prototype.hasOwnProperty.call(table, v) ? table[v] : ligne_(v, 40);
}

const nombreDAvis_ = (n) => (n === 1 ? '1 nouvel avis' : `${n} nouveaux avis`);

/** Une date ISO (Firestore : « 2026-11-25T09:05:00.123456Z ») en heure suisse : « 25.11.2026, 10:05 ». */
function heureSuisse_(iso) {
  if (typeof iso !== 'string' || !iso) return 'date inconnue';
  const d = new Date(iso.replace(/(\.\d{3})\d+/, '$1')); // (au-delà des millièmes : ignoré)
  return Number.isNaN(d.getTime()) ? 'date inconnue' : Utilities.formatDate(d, FUSEAU, 'dd.MM.yyyy, HH:mm');
}

/** Un avis prêt à écrire : tout est nettoyé (mais pas encore échappé pour le HTML). */
function fiche_(a) {
  const num = (n) => typeof n === 'number' && Number.isFinite(n);
  const partie = a.mode === 'none' ? dire_(MODES, a.mode)
    : [dire_(MODES, a.mode), num(a.level) ? `niveau ${a.level}` : '', num(a.day) ? `jour ${a.day}` : '']
      .filter(Boolean).join(', ');
  return {
    smiley: Object.prototype.hasOwnProperty.call(SMILEYS, a.mood) ? SMILEYS[a.mood] : SMILEYS.none,
    sorte: dire_(SORTES, a.kind) || SORTES.other,
    quand: heureSuisse_(a.createdAt),
    texte: texte_(a.text, 1000),
    details: [
      ['Langue', dire_(LANGUES, a.lang)],
      ['Appareil', [dire_(APPAREILS, a.device), dire_(SENS, a.orientation)].filter(Boolean).join(', ')],
      ['Version', ligne_(a.version, 40)],
      ['Partie', partie],
      ['Lieu', ligne_(a.place, 40)],
      ['Écran', ligne_(a.screen, 60)],
    ].filter((d) => d[1]),
    // (le lien direct vers le document seulement pour un identifiant ordinaire, comme ceux que Firestore donne)
    lien: /^[A-Za-z0-9_-]{1,64}$/.test(String(a.id || '')) ? `${CONSOLE}~2F${a.id}` : CONSOLE,
  };
}

/**
 * Le mail récapitulatif : { sujet, texte, html }. Le message de chaque enfant est nettoyé ; dans le texte simple,
 * chacune de ses lignes commence par « │ » (il ne peut pas se faire passer pour le mail lui-même) ; dans le HTML,
 * tout est échappé. plein : la limite est atteinte, d'autres avis attendent peut-être.
 */
function texteDuMail_(avis, options) {
  const plein = Boolean(options && options.plein);
  const fiches = avis.map(fiche_);
  const sujet = `💌 La ferme à Madichelle : ${nombreDAvis_(avis.length)}`;
  const suite = `Il y en a peut-être d'autres : ${PAR_PASSAGE} avis au plus par mail, `
    + 'la suite arrive avec le prochain (dans une heure).';
  const fin = [
    `Tous les avis, dans la console Firestore : ${CONSOLE}`,
    'Une fois lus, tu peux les effacer dans la console (le jeu, lui, ne peut ni les relire ni les effacer).',
    'Ne plus recevoir ces mails : dans https://script.google.com, ouvre le script et lance « desinstaller ».',
  ];

  const texte = [`Bonjour,\n\n${nombreDAvis_(avis.length)} dans « 💌 Ton avis » :`];
  fiches.forEach((f) => {
    texte.push([
      '────────────────────',
      `${f.smiley}  ${f.sorte}  ·  ${f.quand}`,
      f.texte ? f.texte.split('\n').map((l) => `  │ ${l}`).join('\n') : '  (pas de texte : juste le smiley)',
      f.details.map((d) => `${d[0]} : ${d[1]}`).join('  ·  '),
      `Dans la console : ${f.lien}`,
    ].join('\n'));
  });
  if (plein) texte.push(suite);
  texte.push(fin.join('\n'));

  const e = echapper_;
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#2b2b2b;max-width:640px">',
    `<p>${e(nombreDAvis_(avis.length))} dans « 💌 Ton avis » :</p>`,
    ...fiches.map((f) => [
      '<div style="border:1px solid #e6dcc8;border-radius:10px;padding:12px 14px;margin:12px 0;background:#fffaf0">',
      `<div><span style="font-size:22px">${e(f.smiley)}</span> <b>${e(f.sorte)}</b>`,
      ` <span style="color:#777;font-size:13px">· ${e(f.quand)}</span></div>`,
      f.texte
        ? '<div style="margin:8px 0;padding:8px 10px;background:#fff;border-left:3px solid #e0a040">'
          + `${e(f.texte).replace(/\n/g, '<br>')}</div>`
        : '<div style="margin:8px 0;color:#777"><i>(pas de texte : juste le smiley)</i></div>',
      `<div style="color:#666;font-size:12px">${f.details.map((d) => `${e(d[0])} : ${e(d[1])}`).join(' · ')}</div>`,
      `<div style="font-size:12px;margin-top:4px"><a href="${e(f.lien)}">Voir dans la console</a></div>`,
      '</div>',
    ].join('')),
    plein ? `<p><b>${e(suite)}</b></p>` : '',
    `<p style="color:#666;font-size:13px"><a href="${e(CONSOLE)}">Tous les avis, dans la console Firestore</a><br>`,
    `${e(fin[1])}<br>${e(fin[2])}</p>`,
    '</div>',
  ].join('\n');

  return { sujet, texte: texte.join('\n\n'), html };
}

/** Le mail d'alerte (texte simple) : la lecture ne marche plus depuis echecs heures. */
function mailAlerte_(echecs, premierEchec, erreur) {
  return {
    sujet: '⚠️ La ferme à Madichelle : les avis ne peuvent plus être lus',
    texte: [
      'Bonjour,',
      '',
      `Depuis le ${heureSuisse_(premierEchec)}, le script qui t'envoie les avis du jeu n'arrive plus à les lire `
        + `(${echecs} essais de suite, un par heure).`,
      '',
      `Dernière erreur : ${ligne_(erreur, 300)}`,
      '',
      'Rien n\'est perdu : les avis attendent dans la base, ils arriveront dans le mail suivant dès que la lecture '
        + 'remarchera. Tu ne recevras pas d\'autre alerte d\'ici là.',
      '',
      'À vérifier :',
      '- le script tourne bien avec le compte Google propriétaire du projet Firebase « lafermeamadichelle » ;',
      '- dans https://script.google.com, ouvre le script : lance « essai », et regarde « Exécutions » (à gauche) ;',
      '- l\'aide pas à pas : docs/HEBERGEMENT.md du dépôt du jeu, « Recevoir un mail à chaque avis ».',
      '',
      `Les avis, dans la console Firestore : ${CONSOLE}`,
    ].join('\n'),
  };
}

/** Le mail d'essai (texte simple). lecture : { ok, n } ou { ok: false, erreur } ; installe : le passage horaire existe. */
function mailEssai_(lecture, installe) {
  const lignes = ['Bonjour,', '', 'Ceci est le mail d\'essai du script des avis : le mail marche, puisqu\'il est arrivé 🙂',
    ''];
  if (lecture.ok) {
    const n = lecture.n;
    const combien = n ? `${nombreDAvis_(n)}${n >= PAR_PASSAGE ? ' (au moins)' : ''}` : 'aucun nouvel avis';
    const quand = n ? ` ${n === 1 ? 'Il arrivera' : 'Ils arriveront'} avec le prochain passage.` : '';
    lignes.push(`La lecture des avis marche aussi : ${combien} depuis le dernier mail.${quand}`);
  } else {
    lignes.push(`Mais la lecture des avis ne marche pas : ${ligne_(lecture.erreur, 300)}`, '',
      'À vérifier : le script tourne avec le compte Google propriétaire du projet Firebase « lafermeamadichelle », '
        + 'et toutes les autorisations ont été acceptées (relancer « installer » les redemande).');
  }
  lignes.push('', installe
    ? 'Le passage toutes les heures est installé : un mail arrive dès qu\'il y a un nouvel avis (au plus un par heure).'
    : 'Le passage toutes les heures n\'est pas installé : lance « installer ».');
  lignes.push('', `Les avis, dans la console Firestore : ${CONSOLE}`);
  return {
    sujet: lecture.ok ? '✅ La ferme à Madichelle : mail d\'essai' : '⚠️ La ferme à Madichelle : mail d\'essai (lecture impossible)',
    texte: lignes.join('\n'),
  };
}

const messageDe_ = (err) => ligne_(err && err.message ? err.message : err, 300) || 'erreur inconnue';
