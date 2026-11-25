// 📧 Un mail à chaque avis (tools/avis-mail/Code.gs : un script Google Apps Script), chargé dans node (vm) avec de
// faux services Google (UrlFetchApp, MailApp, PropertiesService, Session, ScriptApp, Utilities, LockService, Logger) :
// la requête (filtre, tri, limite, en-têtes), la lecture des documents Firestore (REST), le texte du mail (échappé,
// heure suisse, champs absents tolérés), un mail seulement s'il y a du neuf, le repère qui n'avance qu'après un mail
// parti, les erreurs (repère inchangé, UNE alerte après 6 échecs de suite, qui dit si c'est la lecture ou le mail),
// 50 avis et 100 Ko au plus par mail (le faux MailApp refuse, comme le vrai, plus de 200 Ko : même 50 avis au pire de
// ce que les règles acceptent arrivent tous, en plusieurs mails), installer() qui n'installe qu'une fois, le mail
// d'essai, le manifeste (appsscript.json).
// Puis, avec l'émulateur Firestore (sauté sans lui, comme tests/firestoreRules.test.js), le vrai corps de la requête
// runQuery : seuls les nouveaux avis reviennent, dans l'ordre d'arrivée, aucun oublié. Pour le lancer :
//   npx --yes firebase-tools@15.32.1 emulators:exec --only firestore --project demo-ferme \
//     "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run tests/avis-mail.test.js"
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const CODE = readFileSync(new URL('../tools/avis-mail/Code.gs', import.meta.url), 'utf8');
const MANIFESTE = JSON.parse(readFileSync(new URL('../tools/avis-mail/appsscript.json', import.meta.url), 'utf8'));
const PROJET = 'lafermeamadichelle';
const RUN_QUERY = `https://firestore.googleapis.com/v1/projects/${PROJET}/databases/(default)/documents:runQuery`;
const CONSOLE = `https://console.firebase.google.com/project/${PROJET}/firestore/databases/-default-/data/~2Ffeedback`;
const MOI = 'le-parent'; // (ce que Session rend : l'adresse du compte ; jamais une vraie adresse dans le dépôt)
const REPERE = 'avisMail.repere';
const ECHECS = 'avisMail.echecs';

const NOM = (id, projet = PROJET) => `projects/${projet}/databases/(default)/documents/feedback/${id}`;
const plain = (x) => JSON.parse(JSON.stringify(x)); // (objets venus du contexte vm : comparés comme des objets d'ici)

// Un avis tel que le jeu l'écrit (src/cloud/feedback.js), et sa forme dans l'API REST de Firestore.
const AVIS = {
  text: 'Plus de chevaux !', mood: 'love', kind: 'idea', lang: 'fr', version: '0.5.0+abc1234', device: 'phone',
  orientation: 'portrait', mode: 'manage', level: 4, day: 12, place: 'maison/stable', screen: 'panel:animal ride',
};
function champs(m) {
  const f = {};
  for (const [k, v] of Object.entries(m)) f[k] = Number.isInteger(v) ? { integerValue: String(v) } : { stringValue: v };
  return f;
}
const doc = (id, createdAt, m = AVIS) => ({
  document: {
    name: NOM(id),
    fields: { ...champs(m), ...(createdAt ? { createdAt: { timestampValue: createdAt } } : {}) },
    createTime: createdAt, updateTime: createdAt,
  },
  readTime: '2026-11-25T12:00:00.000001Z',
});
/** La réponse de runQuery : un élément par document ; aucun document → un seul élément avec readTime. */
const reponse = (...docs) => ({ code: 200, texte: JSON.stringify(docs.length ? docs : [{ readTime: '2026-11-25T12:00:00Z' }]) });
const refus = { code: 403, texte: JSON.stringify([{ error: { code: 403, message: 'Missing or insufficient permissions.', status: 'PERMISSION_DENIED' } }]) };

/** Utilities.formatDate (motif de SimpleDateFormat : seulement les lettres dont le script se sert), avec le vrai fuseau. */
function formatDate(d, tz, motif) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(d.getTime())).map((x) => [x.type, x.value]));
  const v = { yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute };
  return motif.replace(/yyyy|MM|dd|HH|mm/g, (t) => v[t]);
}

/** Comme le vrai MailApp avec un compte Gmail : un corps de plus de 200 Ko est refusé (quotas d'Apps Script). */
const MAX_CORPS = 200 * 1024;
const octets = (s) => Buffer.byteLength(s || '', 'utf8');

/**
 * Les faux services Google, et Code.gs chargé avec eux (g.gs : son contexte). g.reponse : ce que Firestore répond
 * (objet { code, texte }, Error : réseau coupé, ou fonction (url, params) qui rend l'un ou l'autre) ; g.mailEchoue :
 * MailApp refuse (un message d'erreur, ou une fonction (mail) qui le rend pour les mails à refuser) ; g.verrouille :
 * un autre passage tient le verrou.
 */
function google({ fetch = null, jeton = 'jeton-du-parent' } = {}) {
  const g = {
    fetches: [], mails: [], logs: [], props: new Map(), triggers: [], created: 0, hours: 0, fuseaux: [],
    reponse: reponse(), mailEchoue: null, verrouille: false,
  };
  let n = 0;
  g.trigger = (fn) => {
    const id = `t${++n}`;
    return { getHandlerFunction: () => fn, getUniqueId: () => id };
  };
  const services = {
    UrlFetchApp: {
      fetch: (url, params) => {
        g.fetches.push({ url, params: plain(params) });
        if (fetch) return fetch(url, params);
        const r = typeof g.reponse === 'function' ? g.reponse(url, params) : g.reponse;
        if (r instanceof Error) throw r;
        return { getResponseCode: () => r.code, getContentText: () => r.texte };
      },
    },
    MailApp: {
      sendEmail: (m) => {
        const refus = typeof g.mailEchoue === 'function' ? g.mailEchoue(m) : g.mailEchoue;
        if (refus) throw new Error(refus);
        if (octets(m.body) + octets(m.htmlBody) > MAX_CORPS) throw new Error('Limit Exceeded: Email Body Size.');
        g.mails.push(plain(m));
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (g.props.has(k) ? g.props.get(k) : null),
        setProperty: (k, v) => { g.props.set(k, String(v)); },
        deleteProperty: (k) => { g.props.delete(k); },
      }),
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => MOI }) },
    ScriptApp: {
      getOAuthToken: () => jeton,
      getProjectTriggers: () => [...g.triggers],
      deleteTrigger: (t) => { g.triggers = g.triggers.filter((x) => x !== t); },
      newTrigger: (fn) => ({
        timeBased: () => ({
          everyHours: (h) => ({
            create: () => {
              g.created++;
              g.hours = h;
              const t = g.trigger(fn);
              g.triggers.push(t);
              return t;
            },
          }),
        }),
      }),
    },
    Utilities: {
      formatDate: (d, tz, motif) => {
        g.fuseaux.push(tz);
        return formatDate(d, tz, motif);
      },
    },
    LockService: { getScriptLock: () => ({ tryLock: () => !g.verrouille, releaseLock: () => {} }) },
    Logger: { log: (s) => g.logs.push(String(s)) },
  };
  g.gs = vm.createContext(services);
  vm.runInContext(CODE, g.gs, { filename: 'Code.gs' });
  g.passage = () => plain(g.gs.verifierLesAvis());
  g.repere = () => (g.props.has(REPERE) ? JSON.parse(g.props.get(REPERE)) : null);
  g.corps = (i = -1) => JSON.parse(g.fetches.at(i).params.payload);
  return g;
}

const ORDRE = [
  { field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' },
  { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
];

/**
 * Des avis au pire de ce que firestore.rules accepte (écrits sans compte, hors du jeu) : chaque texte à sa longueur
 * maximale, plein de ce qui grossit le plus dans le mail (« & » → « &amp; », retour à la ligne → « <br> » et « │ »).
 */
const PIRES = ['&\n\n'.repeat(167).slice(0, 500), '"'.repeat(500), '\'\n'.repeat(250), '<'.repeat(500)];
const pire = (i) => ({
  text: PIRES[i % PIRES.length], mood: 'love', kind: 'idea', lang: 'fr', version: '&'.repeat(40), device: 'phone',
  orientation: 'portrait', mode: 'manage', level: 1000, day: 1000000, place: '&'.repeat(30), screen: '&'.repeat(40),
});
/** Un identifiant comme ceux que Firestore donne (20 caractères). */
const ID = (i) => `d${String(i).padStart(2, '0')}`.padEnd(20, 'x');

/**
 * Un petit Firestore pour g.reponse : la collection rangée par heure puis par nom, le départ juste après le repère
 * (startAt), la limite ; comme la vraie requête (celle-ci est vérifiée dans l'émulateur, plus bas).
 */
const base = (docs) => (url, params) => {
  const q = JSON.parse(params.payload).structuredQuery;
  const cle = (d) => `${d.document.fields.createdAt.timestampValue} ${d.document.name}`; // (heures de même longueur)
  const depart = q.startAt ? q.startAt.values.map((v) => v.timestampValue ?? v.referenceValue).join(' ') : '';
  return reponse(...docs.filter((d) => cle(d) > depart).sort((a, b) => (cle(a) < cle(b) ? -1 : 1)).slice(0, q.limit));
};
/** Les identifiants des avis d'un mail, dans l'ordre (les liens « Dans la console »). */
const idsDuMail = (m) => [...m.body.matchAll(/Dans la console : \S+~2F(\S+)/g)].map((x) => x[1]);

// ---------------------------------------------------------------- la requête et la lecture

describe('📧 la requête Firestore et la lecture des avis', () => {
  let g;
  beforeEach(() => { g = google(); });

  it('runQuery sur « feedback » : jeton du parent, projet Firebase, rangé par heure puis par nom, 50 au plus', () => {
    expect(g.passage()).toEqual({ etat: 'rien', n: 0 });
    expect(g.fetches).toHaveLength(1);
    const { url, params } = g.fetches[0];
    expect(url).toBe(RUN_QUERY);
    expect(params).toMatchObject({ method: 'post', contentType: 'application/json', muteHttpExceptions: true });
    expect(params.headers).toEqual({ Authorization: 'Bearer jeton-du-parent', 'x-goog-user-project': PROJET });
    // Le tout premier passage : depuis le premier avis.
    expect(g.corps()).toEqual({ structuredQuery: { from: [{ collectionId: 'feedback' }], orderBy: ORDRE, limit: 50 } });
  });

  it('avec un repère : filtre createdAt ≥ le dernier vu, départ juste après lui (heure ET nom, à la microseconde)', () => {
    const t = '2026-11-25T09:05:00.123456Z';
    g.props.set(REPERE, JSON.stringify({ t, nom: NOM('abc') }));
    g.passage();
    expect(g.corps()).toEqual({
      structuredQuery: {
        from: [{ collectionId: 'feedback' }],
        where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: t } } },
        orderBy: ORDRE,
        startAt: { values: [{ timestampValue: t }, { referenceValue: NOM('abc') }], before: false },
        limit: 50,
      },
    });
    // Repère abîmé : on repart du début (jamais d'erreur).
    for (const abime of ['{', '{"t":5}', '{"t":"","nom":"x"}', 'null']) {
      g.props.set(REPERE, abime);
      g.passage();
      expect(g.corps().structuredQuery.startAt, abime).toBeUndefined();
    }
  });

  it('documents REST : stringValue, integerValue, timestampValue (gardé tel quel) ; ce qui manque ou est inconnu → null', () => {
    const a = plain(g.gs.lireAvis_({
      name: NOM('Ab12'),
      fields: {
        text: { stringValue: 'Coucou' }, level: { integerValue: '7' }, day: { doubleValue: 3 }, mood: { nullValue: null },
        place: { mapValue: {} }, createdAt: { timestampValue: '2026-11-25T09:05:00.123456Z' }, autre: { stringValue: 'x' },
      },
    }));
    expect(a).toEqual({
      nom: NOM('Ab12'), id: 'Ab12', text: 'Coucou', mood: null, kind: null, lang: null, version: null, device: null,
      orientation: null, mode: null, level: 7, day: 3, place: null, screen: null, createdAt: '2026-11-25T09:05:00.123456Z',
    });
    expect(plain(g.gs.lireAvis_({}))).toMatchObject({ nom: '', id: '', text: null, createdAt: null });
    expect(plain(g.gs.lireAvis_({ name: NOM('x'), fields: { level: { integerValue: 'abc' } } })).level).toBeNull();
  });

  it('réponse : les documents dans l\'ordre (les éléments sans document ignorés) ; erreur, HTTP ≠ 200, illisible → erreur', () => {
    const r = reponse(doc('b', '2026-11-25T09:00:00Z'), doc('a', '2026-11-25T10:00:00Z'));
    expect(plain(g.gs.lireReponse_(200, r.texte)).map((x) => x.id)).toEqual(['b', 'a']);
    expect(plain(g.gs.lireReponse_(200, reponse().texte))).toEqual([]);
    expect(() => g.gs.lireReponse_(403, refus.texte)).toThrow('Firestore a répondu 403 (PERMISSION_DENIED : Missing or insufficient permissions.)');
    expect(() => g.gs.lireReponse_(400, JSON.stringify({ error: { message: 'mauvaise requête' } }))).toThrow('Firestore a répondu 400 (mauvaise requête)');
    expect(() => g.gs.lireReponse_(200, JSON.stringify([{ error: { status: 'ABORTED' } }]))).toThrow('(ABORTED)');
    expect(() => g.gs.lireReponse_(200, 'pas du JSON')).toThrow('Firestore a répondu 200 (réponse illisible)');
    expect(() => g.gs.lireReponse_(200, '{}')).toThrow('réponse illisible');
    expect(() => g.gs.lireReponse_(502, '<html>\n<b>Bad gateway</b>\n</html>')).toThrow('Firestore a répondu 502 (<html> <b>Bad gateway</b> </html>)');
  });
});

// ---------------------------------------------------------------- le mail

describe('📧 le mail : un récapitulatif clair, sans rien d\'injecté', () => {
  let g;
  beforeEach(() => { g = google(); });

  it('UN mail à soi-même : sujet avec le nombre, chaque avis (smiley, sorte, texte, langue, appareil, version, niveau, lieu, écran), heure suisse', () => {
    g.reponse = reponse(
      doc('hiver1', '2026-11-25T09:05:00.123456Z'),
      doc('ete2', '2026-07-01T22:30:00Z', { ...AVIS, text: 'Le chat vole\nsur le toit', mood: 'sad', kind: 'bug', lang: 'en', device: 'tablet', orientation: 'landscape', mode: 'sandbox', level: 0, day: 3, place: 'japon', screen: 'minigame' }),
    );
    expect(g.passage()).toEqual({ etat: 'envoye', n: 2 });
    expect(g.mails).toHaveLength(1);
    const m = g.mails[0];
    expect(m.to).toBe(MOI);
    expect(m.name).toBe('La ferme à Madichelle');
    expect(m.subject).toBe('💌 La ferme à Madichelle : 2 nouveaux avis');
    expect(m.body).toContain('2 nouveaux avis dans « 💌 Ton avis » :');
    // Heure suisse : +1 h en hiver, +2 h en été (le 1er juillet à 22 h 30 UTC, c'est déjà le 2 à Zurich).
    expect(m.body).toContain('😍  💡 Idée  ·  25.11.2026, 10:05\n  │ Plus de chevaux !\n'
      + 'Langue : français  ·  Appareil : téléphone, portrait  ·  Version : 0.5.0+abc1234  ·  Partie : gestion, niveau 4, jour 12'
      + '  ·  Lieu : maison/stable  ·  Écran : panel:animal ride\n'
      + `Dans la console : ${CONSOLE}~2Fhiver1`);
    expect(m.body).toContain('😕  🐞 Bug  ·  02.07.2026, 00:30\n  │ Le chat vole\n  │ sur le toit\n'
      + 'Langue : anglais  ·  Appareil : tablette, paysage  ·  Version : 0.5.0+abc1234  ·  Partie : bac à sable, niveau 0, jour 3'
      + '  ·  Lieu : japon  ·  Écran : minigame');
    expect(m.body.indexOf('Plus de chevaux')).toBeLessThan(m.body.indexOf('Le chat vole')); // (dans l'ordre d'arrivée)
    expect(m.body).toContain(`Tous les avis, dans la console Firestore : ${CONSOLE}`);
    expect(m.body).toContain('lance « desinstaller »');
    expect(m.body).not.toContain('Il y en a peut-être d\'autres');
    expect(new Set(g.fuseaux)).toEqual(new Set(['Europe/Zurich']));
    // La version HTML dit la même chose.
    expect(m.htmlBody).toContain('<b>💡 Idée</b>');
    expect(m.htmlBody).toContain('Le chat vole<br>sur le toit');
    expect(m.htmlBody).toContain(`<a href="${CONSOLE}~2Fete2">Voir dans la console</a>`);
    // Un seul avis : « 1 nouvel avis ».
    const un = plain(g.gs.texteDuMail_([g.gs.lireAvis_(doc('x', '2026-11-25T09:05:00Z').document)]));
    expect(un.sujet).toBe('💌 La ferme à Madichelle : 1 nouvel avis');
  });

  it('échappé : aucune balise ni lien venus d\'un avis dans le HTML ; dans le texte, le message ne peut pas imiter le mail', () => {
    // (un avis écrit hors du jeu : les règles bornent les champs, mais pas leur contenu)
    const piege = {
      ...AVIS,
      text: '<script>alert("x")</script> & <b>gras</b>\nLangue : faux\n\u202Eà l\'envers\u200B\u0007',
      kind: 'spam<i>', mood: '<img>', lang: '<a href="http://x">', version: 'v"><img src=x onerror=alert(1)>',
      place: '<img src=x onerror=alert(1)>', screen: 'a\nb\tc',
    };
    const a = g.gs.lireAvis_({ name: NOM('x"><script>'), fields: { ...champs(piege), createdAt: { timestampValue: '2026-11-25T09:05:00Z' } } });
    const m = plain(g.gs.texteDuMail_([a]));
    // (entre deux balises, & < > suffisent : « " » et « ' » y restent tels quels, inoffensifs)
    expect(m.html).toContain('&lt;script&gt;alert("x")&lt;/script&gt; &amp; &lt;b&gt;gras&lt;/b&gt;<br>Langue : faux<br>à l\'envers');
    const balises = new Set([...m.html.matchAll(/<\/?([a-zA-Z]+)/g)].map((x) => x[1]));
    expect([...balises].sort()).toEqual(['a', 'b', 'br', 'div', 'p', 'span']); // (seulement celles du mail lui-même)
    // Hors des balises du mail, plus aucun < ni > : « onerror= » et « href= » venus d'un avis n'y sont que du texte.
    expect(m.html.replace(/<\/?(a|b|br|div|p|span|i)\b[^<>]*>/g, '')).not.toMatch(/[<>]/);
    expect(m.html).not.toMatch(/<(script|img)|<a href="http:\/\/x/);
    expect([...m.html.matchAll(/<a href="([^"]*)"/g)].map((x) => x[1])).toEqual([CONSOLE, CONSOLE]); // (identifiant bizarre : pas de lien direct)
    expect(vm.runInContext('echapperAttribut_(\'a"b\\\'c<d&\')', g.gs)).toBe('a&quot;b&#39;c&lt;d&amp;'); // (dans un attribut : aussi " et ')
    expect(m.html).toContain('<b>spam&lt;i&gt;</b>'); // (la sorte inconnue, échappée)
    // Texte simple : chaque ligne du message marquée « │ », caractères invisibles et de contrôle retirés.
    expect(m.texte).toContain('  │ <script>alert("x")</script> & <b>gras</b>\n  │ Langue : faux\n  │ à l\'envers\n');
    expect(m.texte.split('\n').filter((l) => l.startsWith('Langue :'))).toEqual([
      'Langue : <a href="http://x">  ·  Appareil : téléphone, portrait  ·  Version : v"><img src=x onerror=alert(1)>  ·  Partie : '
        + 'gestion, niveau 4, jour 12  ·  Lieu : <img src=x onerror=alert(1)>  ·  Écran : a b c',
    ]);
    expect(m.texte).toContain('💬  spam<i>  ·  25.11.2026, 10:05'); // (humeur inconnue : 💬)
    for (const s of [m.texte, m.html, m.sujet]) expect(s).not.toMatch(/[\u202E\u200B\u0007]/);
    expect(m.sujet).toBe('💌 La ferme à Madichelle : 1 nouvel avis'); // (rien d'un avis dans le sujet)
    // Un message très long (écrit hors du jeu) est coupé.
    const long = plain(g.gs.texteDuMail_([g.gs.lireAvis_({ name: NOM('L'), fields: { text: { stringValue: 'é'.repeat(5000) } } })]));
    expect(long.texte.length).toBeLessThan(2500);
  });

  it('champs absents tolérés : un smiley seul, sans contexte ni date ; écran des profils', () => {
    const seul = g.gs.lireAvis_({ name: NOM('s1'), fields: { mood: { stringValue: 'happy' } } });
    const profils = g.gs.lireAvis_({ name: NOM('s2'), fields: { ...champs({ ...AVIS, text: '', mood: 'meh', kind: 'like', mode: 'none', level: 0, day: 0, place: '', screen: 'profiles' }), createdAt: { timestampValue: 'pas une date' } } });
    const m = plain(g.gs.texteDuMail_([seul, profils]));
    expect(m.texte).toContain('🙂  ✉️ Autre  ·  date inconnue\n  (pas de texte : juste le smiley)\n\nDans la console : ');
    expect(m.texte).toContain('😐  ❤️ J\'aime  ·  date inconnue\n  (pas de texte : juste le smiley)\n'
      + 'Langue : français  ·  Appareil : téléphone, portrait  ·  Version : 0.5.0+abc1234  ·  Partie : écran des profils  ·  Écran : profiles\n');
    expect(m.html).toContain('<i>(pas de texte : juste le smiley)</i>');
    expect(m.texte).not.toMatch(/undefined|null|NaN/);
    expect(m.html).not.toMatch(/undefined|null|NaN/);
  });
});

// ---------------------------------------------------------------- les passages

describe('📧 les passages : un mail seulement s\'il y a du neuf, le repère, les erreurs', () => {
  let g;
  beforeEach(() => { g = google(); });
  const T1 = '2026-11-25T09:05:00.123456Z';
  const T2 = '2026-11-25T09:05:00.123457Z'; // (une microseconde plus tard : une Date JS ne verrait pas la différence)

  it('rien de neuf : pas de mail, rien ne change', () => {
    g.props.set(REPERE, JSON.stringify({ t: T1, nom: NOM('a1') }));
    expect(g.passage()).toEqual({ etat: 'rien', n: 0 });
    expect(g.passage()).toEqual({ etat: 'rien', n: 0 });
    expect(g.mails).toEqual([]);
    expect(g.repere()).toEqual({ t: T1, nom: NOM('a1') });
    expect([...g.props.keys()]).toEqual([REPERE]);
  });

  it('le repère avance seulement après un mail parti, sur le dernier avis exactement (à la microseconde)', () => {
    g.reponse = reponse(doc('a1', T1), doc('a0', T2));
    g.mailEchoue = 'Service invoked too many times for one day: email.';
    expect(g.passage()).toMatchObject({ etat: 'erreur', echecs: 1 });
    expect(g.mails).toEqual([]);
    expect(g.repere()).toBeNull(); // (pas de mail : pas de repère)
    expect(g.props.get(ECHECS)).toBe('1');
    g.mailEchoue = null;
    expect(g.passage()).toEqual({ etat: 'envoye', n: 2 });
    expect(g.mails).toHaveLength(1);
    expect(g.repere()).toEqual({ t: T2, nom: NOM('a0') });
    expect(g.props.has(ECHECS)).toBe(false);
    // Le passage suivant repart juste après lui : rien de neuf, pas de mail.
    g.reponse = reponse();
    expect(g.passage()).toEqual({ etat: 'rien', n: 0 });
    expect(g.corps().structuredQuery.startAt).toEqual({ values: [{ timestampValue: T2 }, { referenceValue: NOM('a0') }], before: false });
    expect(g.mails).toHaveLength(1);
    // Seule la requête de lecture part vers Firestore (le script n'écrit jamais rien).
    expect(new Set(g.fetches.map((f) => f.url))).toEqual(new Set([RUN_QUERY]));
  });

  it('erreur (refus, réseau, illisible, HTTP 500) : pas de mail d\'avis, repère inchangé ; UNE alerte après 6 échecs de suite', () => {
    const R0 = { t: T1, nom: NOM('a1') };
    g.props.set(REPERE, JSON.stringify(R0));
    g.gs.maintenant_ = () => new Date('2026-11-25T08:00:00Z'); // (le premier échec)
    const erreurs = [refus, new Error('Address unavailable: https://firestore.googleapis.com'), { code: 200, texte: 'oups' },
      { code: 500, texte: 'Internal error' }, refus, refus, refus, refus];
    erreurs.forEach((e, i) => {
      g.reponse = e;
      let r;
      expect(() => { r = plain(g.gs.verifierLesAvis()); }).not.toThrow();
      expect(r).toMatchObject({ etat: 'erreur', echecs: i + 1, alerte: i === 5 });
      expect(g.repere()).toEqual(R0);
      expect(g.mails, `après ${i + 1} échecs`).toHaveLength(i >= 5 ? 1 : 0);
    });
    const alerte = g.mails[0];
    expect(alerte.to).toBe(MOI);
    expect(alerte.subject).toBe('⚠️ La ferme à Madichelle : les avis ne peuvent plus être lus');
    expect(alerte.htmlBody).toBeUndefined(); // (texte simple)
    expect(alerte.body).toContain('Depuis le 25.11.2026, 09:00'); // (heure suisse)
    expect(alerte.body).toContain('(6 essais de suite, un par heure)');
    expect(alerte.body).toContain('Dernière erreur : Firestore a répondu 403 (PERMISSION_DENIED : Missing or insufficient permissions.)');
    expect(alerte.body).toContain('Rien n\'est perdu');
    expect(g.logs.some((l) => l.includes('Address unavailable'))).toBe(true);
    // Ça remarche : les avis arrivés entre-temps partent, les compteurs repartent de zéro…
    g.reponse = reponse(doc('a2', T2));
    expect(g.passage()).toEqual({ etat: 'envoye', n: 1 });
    expect(g.mails).toHaveLength(2);
    expect(g.corps().structuredQuery.startAt.values[0]).toEqual({ timestampValue: T1 });
    expect([...g.props.keys()]).toEqual([REPERE]);
    // … et une nouvelle série de 6 échecs donne une nouvelle (et une seule) alerte.
    g.reponse = refus;
    for (let i = 0; i < 9; i++) g.passage();
    expect(g.mails).toHaveLength(3);
  });

  it('alerte refusée par MailApp : retentée au passage suivant (toujours une seule qui part)', () => {
    g.reponse = refus;
    for (let i = 0; i < 5; i++) g.passage();
    g.mailEchoue = 'quota';
    expect(g.passage()).toMatchObject({ echecs: 6, alerte: false });
    g.mailEchoue = null;
    expect(g.passage()).toMatchObject({ echecs: 7, alerte: true });
    g.passage();
    expect(g.mails).toHaveLength(1);
  });

  it('50 avis au plus par passage : un seul mail, la suite annoncée, le repère sur le 50e', () => {
    const t = (i) => `2026-11-25T09:${String(i).padStart(2, '0')}:00.000001Z`;
    g.reponse = reponse(...Array.from({ length: 50 }, (_, i) => doc(`d${i}`, t(i))));
    expect(g.passage()).toEqual({ etat: 'envoye', n: 50 });
    expect(g.corps().structuredQuery.limit).toBe(50);
    expect(g.mails).toHaveLength(1);
    expect(g.mails[0].subject).toBe('💌 La ferme à Madichelle : 50 nouveaux avis');
    expect(g.mails[0].body).toContain('Il y en a peut-être d\'autres : 50 avis au plus par mail, la suite arrive avec le prochain (dans une heure).');
    expect(g.mails[0].body.match(/Dans la console : /g)).toHaveLength(50);
    expect(g.repere()).toEqual({ t: t(49), nom: NOM('d49') });
    g.reponse = reponse(...Array.from({ length: 49 }, (_, i) => doc(`e${i}`, t(i + 1).replace('09:', '10:'))));
    g.passage();
    expect(g.mails[1].body).not.toContain('Il y en a peut-être d\'autres');
  });

  it('50 avis au pire de ce que les règles acceptent : des mails sous 100 Ko, le repère sur le dernier ENVOYÉ, la suite au passage suivant', () => {
    const T = '2026-11-25T09:05:00.123456Z'; // (écrits d'un coup : la même heure pour tous)
    const docs = Array.from({ length: 50 }, (_, i) => doc(ID(i), T, pire(i)));
    // Tous dans un seul mail, comme avant : bien plus que ce que MailApp accepte (il serait refusé à chaque passage).
    const tous = plain(g.gs.texteDuMail_(docs.map((d) => g.gs.lireAvis_(d.document)), { plein: true }));
    expect(octets(tous.texte) + octets(tous.html)).toBeGreaterThan(MAX_CORPS);
    g.reponse = base(docs);
    const r1 = g.passage();
    expect(r1.etat).toBe('envoye');
    expect(r1.n).toBeGreaterThan(5);
    expect(r1.n).toBeLessThan(50);
    expect(g.mails).toHaveLength(1);
    const m1 = g.mails[0];
    expect(m1.subject).toBe(`💌 La ferme à Madichelle : ${r1.n} nouveaux avis`);
    expect(idsDuMail(m1)).toEqual(docs.slice(0, r1.n).map((d) => d.document.name.split('/').pop()));
    expect(m1.body).toContain('D\'autres avis attendent (un mail ne peut pas tout contenir) : la suite arrive avec le prochain (dans une heure).');
    expect(m1.htmlBody).toContain('<p><b>D\'autres avis attendent');
    expect(g.repere()).toEqual({ t: T, nom: NOM(ID(r1.n - 1)) }); // (le dernier du mail, pas le 50e lu)
    expect(g.logs).toContain(`${r1.n} nouveaux avis : mail envoyé (encore ${50 - r1.n} au passage suivant).`);
    // Un vrai avis arrive entre-temps : il passe après les autres, rien n'est perdu ni répété.
    docs.push(doc('tard', '2026-11-25T10:00:00.000000Z'));
    const envoyes = [...idsDuMail(m1)];
    for (let i = 0; i < 10 && g.passage().etat === 'envoye'; i++) envoyes.push(...idsDuMail(g.mails.at(-1)));
    expect(envoyes).toEqual([...Array.from({ length: 50 }, (_, i) => ID(i)), 'tard']);
    expect(g.mails.length).toBeLessThanOrEqual(4);
    for (const m of g.mails) expect(octets(m.subject) + octets(m.body) + octets(m.htmlBody)).toBeLessThanOrEqual(100000);
    expect(g.mails.at(-1).body).not.toMatch(/D'autres avis attendent|Il y en a peut-être/);
    expect(g.props.has(ECHECS)).toBe(false);
  });

  it('un avis seul tient toujours dans un mail, quoi qu\'il y ait dans la base (chaque champ est borné)', () => {
    // (écrit par le propriétaire, hors des règles : texte immense, champs inconnus, identifiant de 1500 caractères)
    const n = (s, k) => s.repeat(k);
    const a = g.gs.lireAvis_({
      name: NOM(n('&', 1500)),
      fields: {
        ...champs({ ...pire(0), text: n('&\n\n', 20000), kind: n('&', 5000), mood: n('<', 5000), lang: n('&', 5000), device: n('&', 5000), orientation: n('&', 5000), mode: n('&', 5000), version: n('&\n', 5000), place: n('&', 5000), screen: n('&', 5000) }),
        createdAt: { timestampValue: '2026-11-25T09:05:00Z' },
      },
    });
    const { mail, n: combien } = plain(g.gs.mailDesAvis_([a]));
    expect(combien).toBe(1);
    expect(octets(mail.sujet) + octets(mail.texte) + octets(mail.html)).toBeLessThan(20000); // (MAX_OCTETS : 100 000)
    expect(plain(g.gs.mailDesAvis_([]))).toEqual({ mail: null, n: 0 });
  });

  it('octets_ : la taille en UTF-8, comme le mail (accents, emojis, moitié d\'emoji)', () => {
    for (const s of ['', 'abc', 'é', '│', '😍 Plus de chevaux ! 🐴', 'a\uD83D', '\uDE0Da', '&amp;\n<br>'.repeat(30)]) {
      expect(g.gs.octets_(s), JSON.stringify(s)).toBe(Buffer.byteLength(s, 'utf8'));
    }
  });

  it('mail des avis refusé (pas la lecture) : repère inchangé, et l\'alerte dit que c\'est le mail qui ne part plus', () => {
    g.gs.maintenant_ = () => new Date('2026-11-25T08:00:00Z');
    g.reponse = reponse(doc('a1', T1));
    g.mailEchoue = (m) => (m.subject.startsWith('💌') ? 'Limit Exceeded: Email Body Size.' : null); // (l'alerte, elle, part)
    for (let i = 1; i <= 7; i++) expect(g.passage(), `passage ${i}`).toMatchObject({ etat: 'erreur', echecs: i, alerte: i === 6 });
    expect(g.repere()).toBeNull();
    expect(g.logs).toContain('Avis lus, mais mail refusé (échec 1 de suite) : Limit Exceeded: Email Body Size. On réessaie dans une heure.');
    expect(g.mails).toHaveLength(1);
    const alerte = g.mails[0];
    expect(alerte.subject).toBe('⚠️ La ferme à Madichelle : le mail des avis ne part plus');
    expect(alerte.body).toContain('Depuis le 25.11.2026, 09:00, le script lit bien les avis du jeu, mais Google refuse d\'envoyer le mail qui les récapitule (6 essais de suite, un par heure).');
    expect(alerte.body).toContain('Dernière erreur : Limit Exceeded: Email Body Size.');
    expect(alerte.body).toContain('ils arriveront dans le mail suivant dès que le mail repartira');
    expect(alerte.body).not.toMatch(/ne peuvent plus être lus|n'arrive plus à les lire/);
    // Le mail repart : les avis arrivent, les compteurs repartent de zéro.
    g.mailEchoue = null;
    expect(g.passage()).toEqual({ etat: 'envoye', n: 1 });
    expect(g.repere()).toEqual({ t: T1, nom: NOM('a1') });
    expect([...g.props.keys()]).toEqual([REPERE]);
  });

  it('un passage déjà en cours (verrou pris) : le second ne fait rien', () => {
    g.verrouille = true;
    expect(g.passage()).toEqual({ etat: 'occupe' });
    expect(g.fetches).toEqual([]);
  });
});

// ---------------------------------------------------------------- installer, désinstaller, essai

describe('📧 installer, desinstaller, essai', () => {
  let g;
  beforeEach(() => { g = google(); });
  const horaires = () => g.triggers.filter((t) => t.getHandlerFunction() === 'verifierLesAvis');

  it('installer() : un seul passage horaire, même lancé deux fois, et un premier passage tout de suite', () => {
    g.reponse = reponse(doc('a1', '2026-11-25T09:05:00Z'));
    expect(plain(g.gs.installer())).toEqual({ etat: 'envoye', n: 1 });
    expect(g.created).toBe(1);
    expect(g.hours).toBe(1);
    expect(g.fetches).toHaveLength(1);
    expect(g.mails).toHaveLength(1);
    g.reponse = reponse();
    expect(plain(g.gs.installer())).toEqual({ etat: 'rien', n: 0 });
    expect(g.created).toBe(1);
    expect(horaires()).toHaveLength(1);
    expect(g.fetches).toHaveLength(2);
    expect(g.mails).toHaveLength(1);
  });

  it('installer() retire les doublons d\'avant et laisse les autres déclencheurs', () => {
    const autre = g.trigger('autreChose');
    g.triggers = [g.trigger('verifierLesAvis'), autre, g.trigger('verifierLesAvis'), g.trigger('verifierLesAvis')];
    g.gs.installer();
    expect(g.created).toBe(0);
    expect(horaires()).toHaveLength(1);
    expect(g.triggers).toContain(autre);
  });

  it('installer() quand la lecture ne marche pas encore : installé quand même, et une erreur claire', () => {
    g.reponse = refus;
    expect(() => g.gs.installer()).toThrow(/^Installé, mais la lecture des avis ne marche pas encore : Firestore a répondu 403/);
    expect(horaires()).toHaveLength(1);
    expect(g.mails).toEqual([]);
  });

  it('desinstaller() : plus de passage horaire ; le repère est gardé (réinstallé, il reprend là où il s\'était arrêté)', () => {
    g.reponse = reponse(doc('a1', '2026-11-25T09:05:00Z'));
    g.gs.installer();
    const autre = g.trigger('autreChose');
    g.triggers.push(autre);
    expect(g.gs.desinstaller()).toBe(1);
    expect(g.triggers).toEqual([autre]);
    expect(g.repere()).toEqual({ t: '2026-11-25T09:05:00Z', nom: NOM('a1') });
    expect(g.gs.desinstaller()).toBe(0);
  });

  it('essai() : un mail d\'essai à soi-même, qui dit si la lecture et le passage horaire marchent, sans bouger le repère', () => {
    g.reponse = reponse(doc('a1', '2026-11-25T09:05:00Z'), doc('a2', '2026-11-25T09:06:00Z'), doc('a3', '2026-11-25T09:07:00Z'));
    expect(plain(g.gs.essai())).toEqual({ ok: true, n: 3, dansUnMail: 3 });
    expect(g.mails).toHaveLength(1);
    expect(g.mails[0]).toMatchObject({ to: MOI, subject: '✅ La ferme à Madichelle : mail d\'essai' });
    expect(g.mails[0].body).toContain('La lecture des avis marche aussi : 3 nouveaux avis depuis le dernier mail. Ils arriveront avec le prochain passage.');
    expect(g.mails[0].body).toContain('n\'est pas installé : lance « installer »');
    expect(g.repere()).toBeNull();
    g.triggers.push(g.trigger('verifierLesAvis'));
    g.reponse = refus;
    expect(plain(g.gs.essai())).toMatchObject({ ok: false });
    expect(g.mails[1].subject).toBe('⚠️ La ferme à Madichelle : mail d\'essai (lecture impossible)');
    expect(g.mails[1].body).toContain('Mais la lecture des avis ne marche pas : Firestore a répondu 403');
    expect(g.mails[1].body).toContain('Le passage toutes les heures est installé');
    expect(g.props.has(ECHECS)).toBe(false); // (un essai ne compte pas comme un échec du passage)
    g.reponse = reponse();
    g.gs.essai();
    expect(g.mails[2].body).toContain('aucun nouvel avis depuis le dernier mail.\n');
    // Trop d'avis (ou trop gros) pour un seul mail : ils arriveront en plusieurs fois.
    g.reponse = reponse(...Array.from({ length: 30 }, (_, i) => doc(ID(i), '2026-11-25T09:05:00Z', pire(i))));
    const lecture = plain(g.gs.essai());
    expect(lecture.n).toBe(30);
    expect(lecture.dansUnMail).toBeLessThan(30);
    expect(g.mails[3].body).toContain('30 nouveaux avis depuis le dernier mail. Ils arriveront avec les prochains passages (un mail par heure).');
    expect(g.repere()).toBeNull();
    // Le mail ne part pas : l'essai échoue (en rouge dans le journal d'exécution).
    g.mailEchoue = 'quota';
    expect(() => g.gs.essai()).toThrow('quota');
  });
});

// ---------------------------------------------------------------- le manifeste et le code

describe('📧 le manifeste et le code', () => {
  it('appsscript.json : heure suisse, V8, exactement les 5 autorisations nécessaires', () => {
    expect(MANIFESTE.timeZone).toBe('Europe/Zurich');
    expect(MANIFESTE.runtimeVersion).toBe('V8');
    expect([...MANIFESTE.oauthScopes].sort()).toEqual([
      'https://www.googleapis.com/auth/datastore',
      'https://www.googleapis.com/auth/script.external_request',
      'https://www.googleapis.com/auth/script.scriptapp',
      'https://www.googleapis.com/auth/script.send_mail',
      'https://www.googleapis.com/auth/userinfo.email',
    ]);
  });

  it('Code.gs : sans import, sans adresse e-mail ni clé, seulement les services prévus', () => {
    expect(CODE).not.toMatch(/^\s*(import|export)\s|require\(/m);
    expect(CODE).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    expect(CODE).not.toMatch(/AIza|apiKey|password|mot de passe\s*[:=]/i);
    const services = new Set(CODE.match(/\b[A-Z][A-Za-z]+(App|Service)\b/g));
    expect([...services].sort()).toEqual(['LockService', 'MailApp', 'PropertiesService', 'ScriptApp', 'UrlFetchApp']);
    expect(CODE).not.toMatch(/\b(GmailApp|DriveApp|SpreadsheetApp|DocumentApp)\b/);
    // Les fonctions à lancer (le menu d'Apps Script montre celles qui ne finissent pas par « _ »).
    const visibles = [...CODE.matchAll(/^function ([A-Za-z0-9]+)\(/gm)].map((x) => x[1]).filter((n) => !n.endsWith('_'));
    expect(visibles.sort()).toEqual(['desinstaller', 'essai', 'installer', 'verifierLesAvis']);
  });
});

// ---------------------------------------------------------------- avec l'émulateur Firestore

const HOST = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!HOST)('📧 la vraie requête runQuery (émulateur Firestore)', () => {
  const P = 'demo-avis-mail'; // (un projet à part : les autres tests de l'émulateur écrivent aussi des avis)
  const racine = `http://${HOST}/v1/projects/${P}/databases/(default)/documents`;
  const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }; // (l'administrateur : comme le propriétaire avec ses droits Google)
  const CTX = { lang: 'fr', version: '0.5.0+abc1234', device: 'phone', orientation: 'portrait', mode: 'manage', level: 4, day: 12, place: 'maison', screen: 'panel:animal' };
  let g;
  let buildMessage;

  const vider = () => fetch(`http://${HOST}/emulator/v1/projects/${P}/databases/(default)/documents`, { method: 'DELETE' });
  /** Écrit des avis (le message construit par le jeu ; createdAt : l'heure du serveur). Dans un même envoi : la même heure. */
  async function ecrire(...avis) {
    const writes = avis.map(([id, text]) => ({
      update: { name: NOM(id, P), fields: champs(buildMessage({ mood: 'happy', kind: 'idea', text }, CTX)) },
      updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    }));
    const r = await fetch(`${racine}:commit`, { method: 'POST', headers: owner, body: JSON.stringify({ writes }) });
    expect(r.ok, await r.text()).toBe(true);
  }
  /** Le vrai corps de la requête du script, envoyé à l'émulateur ; la réponse lue par le script. */
  async function lire(repere, limite) {
    const r = await fetch(`${racine}:runQuery`, { method: 'POST', headers: owner, body: JSON.stringify(g.gs.corpsDeLaRequete_(repere, limite)) });
    return plain(g.gs.lireReponse_(r.status, await r.text()));
  }
  const textes = (avis) => avis.map((a) => a.text);
  const apres = (a) => ({ t: a.createdAt, nom: a.nom });
  // UrlFetchApp.fetch est synchrone : la requête du script part d'un petit node à part (vers l'émulateur, dans le
  // projet de test).
  const versLEmulateur = (url, params) => {
    const local = url.replace(`https://firestore.googleapis.com/v1/projects/${PROJET}/`, `http://${HOST}/v1/projects/${P}/`);
    const out = execFileSync(process.execPath, ['-e', `
      let s = '';
      process.stdin.on('data', (c) => { s += c; }).on('end', async () => {
        const { url, p } = JSON.parse(s);
        const r = await fetch(url, { method: p.method.toUpperCase(), headers: { ...p.headers, 'Content-Type': p.contentType }, body: p.payload });
        process.stdout.write(JSON.stringify({ code: r.status, texte: await r.text() }));
      });`], { input: JSON.stringify({ url: local, p: params }) });
    const r = JSON.parse(out);
    return { getResponseCode: () => r.code, getContentText: () => r.texte };
  };

  beforeAll(async () => {
    ({ buildMessage } = await import('../src/cloud/feedback.js'));
    g = google();
  });
  beforeEach(async () => { await vider(); });

  it('seuls les nouveaux avis reviennent, dans l\'ordre d\'arrivée (pas celui des noms), la limite respectée', async () => {
    await ecrire(['z1', 'premier']);
    await ecrire(['y2', 'deuxième']);
    await ecrire(['x3', 'troisième']);
    const tous = await lire(null);
    expect(textes(tous)).toEqual(['premier', 'deuxième', 'troisième']);
    expect(tous[0]).toMatchObject({ id: 'z1', nom: NOM('z1', P), mood: 'happy', kind: 'idea', lang: 'fr', level: 4, day: 12, place: 'maison' });
    expect(tous[0].createdAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/);
    expect(textes(await lire(apres(tous[0])))).toEqual(['deuxième', 'troisième']);
    expect(textes(await lire(apres(tous[1])))).toEqual(['troisième']);
    expect(await lire(apres(tous[2]))).toEqual([]);
    expect(textes(await lire(null, 2))).toEqual(['premier', 'deuxième']);
    await ecrire(['a4', 'quatrième']);
    expect(textes(await lire(apres(tous[2])))).toEqual(['quatrième']);
  });

  it('des avis arrivés à la même heure : aucun oublié ni répété, même quand la limite tombe entre eux', async () => {
    await ecrire(['m0', 'avant']);
    const [avant] = await lire(null);
    await ecrire(['b5', 'cinq'], ['a4', 'quatre'], ['c6', 'six']); // (un seul envoi : le même createdAt)
    await ecrire(['a1', 'sept']);
    const memeHeure = (await lire(apres(avant))).slice(0, 3);
    expect(new Set(memeHeure.map((a) => a.createdAt)).size).toBe(1);
    let repere = apres(avant);
    const vus = [];
    for (let i = 0; i < 10; i++) {
      const page = await lire(repere, 2);
      if (!page.length) break;
      vus.push(...textes(page));
      repere = plain(g.gs.repereApres_(page));
    }
    expect(vus).toEqual(['quatre', 'cinq', 'six', 'sept']);
  });

  it('le vrai passage (verifierLesAvis) contre l\'émulateur : un mail avec les nouveaux seulement, puis rien', async () => {
    const h = google({ fetch: versLEmulateur, jeton: 'owner' });
    await ecrire(['p2', 'Un poney rose !']);
    await ecrire(['p1', 'Bug : le chat <vole>']);
    expect(h.passage()).toEqual({ etat: 'envoye', n: 2 });
    expect(h.mails).toHaveLength(1);
    const corps = h.mails[0].body;
    expect(corps.indexOf('  │ Un poney rose !')).toBeGreaterThan(0);
    expect(corps.indexOf('  │ Bug : le chat <vole>')).toBeGreaterThan(corps.indexOf('Un poney rose'));
    expect(h.mails[0].htmlBody).toContain('Bug : le chat &lt;vole&gt;');
    expect(h.passage()).toEqual({ etat: 'rien', n: 0 });
    expect(h.mails).toHaveLength(1);
    await ecrire(['p0', 'Encore un avis']);
    expect(h.passage()).toEqual({ etat: 'envoye', n: 1 });
    expect(h.mails[1].body).toContain('Encore un avis');
    expect(h.mails[1].body).not.toContain('Un poney rose');
  });

  it('50 avis au pire, écrits SANS compte (les règles les acceptent) : tous arrivent, une fois chacun, en mails sous 100 Ko', async () => {
    /** Écrit des avis sans compte, comme n'importe qui par l'API (un seul envoi : la même heure pour tous). */
    const sansCompte = (avis) => fetch(`${racine}:commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        writes: avis.map(([id, m]) => ({
          update: { name: NOM(id, P), fields: champs(m) },
          updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        })),
      }),
    });
    // (les règles jouent bien : un texte de 501 caractères est refusé)
    expect((await sansCompte([['trop', { ...pire(1), text: 'x'.repeat(501) }]])).status).toBe(403);
    const r = await sansCompte(Array.from({ length: 50 }, (_, i) => [ID(i), pire(i)]));
    expect(r.ok, await r.text()).toBe(true);
    const h = google({ fetch: versLEmulateur, jeton: 'owner' });
    const premier = h.passage();
    expect(premier.etat).toBe('envoye');
    expect(premier.n).toBeLessThan(50);
    await ecrire(['tard', 'Un vrai avis, arrivé après']);
    const envoyes = [...idsDuMail(h.mails[0])];
    for (let i = 0; i < 10 && h.passage().etat === 'envoye'; i++) envoyes.push(...idsDuMail(h.mails.at(-1)));
    expect(envoyes).toEqual([...Array.from({ length: 50 }, (_, i) => ID(i)), 'tard']);
    for (const m of h.mails) expect(octets(m.subject) + octets(m.body) + octets(m.htmlBody)).toBeLessThanOrEqual(100000);
    expect(h.mails.at(-1).body).toContain('  │ Un vrai avis, arrivé après');
    expect(h.props.has(ECHECS)).toBe(false);
  });
});
