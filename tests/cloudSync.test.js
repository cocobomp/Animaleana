// Synchro v2, le plan (module pur src/sim/cloudSync.js) : décisions par « ce qui a changé depuis le dernier
// accord » (égalités de rev ET de gen), jamais par l'heure de deux appareils.
import { describe, it, expect } from 'vitest';
import {
  planSync, applyDone, cleanMeta, planIsEmpty, claimParties, linkParty, deleteKind, noteDeleted, noteAccount, unlinkAccount,
  revOf, docGen, isTombstone, newGen, validId, DEVICE, MAX_GEN,
} from '../src/sim/cloudSync.js';

const U = 'uid-lea';
const OTHER = 'uid-tom';
const G = 'gen-a'; // identité du document en ligne
const meta = (owners = {}, base = {}, deleted = {}, accounts = {}) => ({ v: 2, owners, base, deleted, accounts });
const empty = (plan, except = []) => {
  for (const k of ['upload', 'download', 'conflict', 'tombstone', 'removeLocal', 'unlink', 'held']) if (!except.includes(k)) expect(plan[k], k).toEqual([]);
};

describe('mémoire v2', () => {
  it('mémoire vide, abîmée ou de la v1 : remise à zéro (rien n\'est perdu, la synchro recompare)', () => {
    const zero = { v: 2, owners: {}, base: {}, deleted: {}, accounts: {} };
    expect(cleanMeta(undefined)).toEqual(zero);
    expect(cleanMeta('abîmé')).toEqual(zero);
    expect(cleanMeta({ owners: { a: U }, synced: { a: 10 }, deleted: { b: 5 } })).toEqual(zero); // v1
  });

  it('garde les entrées valides, jette les abîmées', () => {
    const m = cleanMeta({
      v: 2,
      owners: { a: U, b: 3 },
      base: { a: { rev: 2, gen: G, localAt: 9 }, b: { rev: 'x' }, c: { rev: 1, localAt: 1, gen: 'x'.repeat(MAX_GEN + 1) } },
      deleted: { c: { rev: 1, gen: G, uid: U }, d: {} },
      accounts: { [U]: 'lea@x.ch', bad: 3 },
    });
    expect(m).toEqual({
      v: 2,
      owners: { a: U },
      base: { a: { rev: 2, gen: G, localAt: 9 }, c: { rev: 1, gen: null, localAt: 1 } },
      deleted: { c: { rev: 1, gen: G, uid: U } },
      accounts: { [U]: 'lea@x.ch' },
    });
  });

  it('cleanMeta ne partage pas les objets d\'origine', () => {
    const src = meta({ a: U });
    const m = cleanMeta(src);
    m.owners.b = U;
    expect(src.owners).toEqual({ a: U });
  });

  it('revOf / docGen / isTombstone : documents de la v1 (sans rev ni gen) ; pierres tombales v2 (gone) et v1 (deleted)', () => {
    expect(revOf({})).toBe(0);
    expect(revOf({ rev: 3 })).toBe(3);
    expect(revOf({ rev: 'x' })).toBe(0);
    expect(docGen({})).toBeNull();
    expect(docGen({ gen: G })).toBe(G);
    expect(isTombstone({ gone: true })).toBe(true);
    expect(isTombstone({ deleted: true })).toBe(true);
    expect(isTombstone({ data: '{}' })).toBe(false);
  });

  it('newGen : une identité différente à chaque fois, assez courte pour firestore.rules', () => {
    const gens = new Set(Array.from({ length: 200 }, newGen));
    expect(gens.size).toBe(200);
    for (const g of gens) expect(g.length).toBeLessThanOrEqual(MAX_GEN);
  });

  it('validId : même règle que firestore.rules', () => {
    expect(validId('mfa12abc9x')).toBe(true);
    expect(validId('a_b-C9')).toBe(true);
    expect(validId('')).toBe(false);
    expect(validId('a/b')).toBe(false);
    expect(validId('é')).toBe(false);
    expect(validId('x'.repeat(65))).toBe(false);
  });
});

describe('planSync : parties sans compte (tablette partagée)', () => {
  it('ne prend JAMAIS une partie sans compte toute seule', () => {
    const plan = planSync([{ id: 'a', updatedAt: 10 }, { id: 'b', updatedAt: 20 }], [], {}, U);
    expect(plan.unowned).toEqual(['a', 'b']);
    empty(plan);
  });

  it('ni une partie gardée sur l\'appareil, ni celle d\'un autre compte', () => {
    const plan = planSync([{ id: 'd', updatedAt: 1 }, { id: 't', updatedAt: 2 }], [{ id: 'd', rev: 3, gen: G, updatedAt: 5 }, { id: 't', rev: 1, gen: G }], meta({ d: DEVICE, t: OTHER }), U);
    empty(plan);
    expect(plan.unowned).toEqual([]);
  });

  it('claimParties : cochées → ce compte, les autres → gardées sur l\'appareil', () => {
    const m = claimParties({}, U, ['a', 'b', 'c'], ['a', 'c']);
    expect(m.owners).toEqual({ a: U, b: DEVICE, c: U });
    // Puis la synchro les envoie (rev 1), sans toucher à b.
    const plan = planSync([{ id: 'a', updatedAt: 1 }, { id: 'b', updatedAt: 1 }, { id: 'c', updatedAt: 1 }], [], m, U);
    expect(plan.upload).toEqual([{ id: 'a', expect: null, gen: null }, { id: 'c', expect: null, gen: null }]);
  });

  it('claimParties ne change pas une partie déjà liée', () => {
    expect(claimParties(meta({ a: OTHER }), U, ['a'], ['a']).owners.a).toBe(OTHER);
  });

  it('linkParty (« Mettre dans mon compte », partie créée connecté, ou liée à un autre compte) : liée, jamais comparée', () => {
    const m = linkParty(meta({ a: DEVICE }, { a: { rev: 1, gen: G, localAt: 1 } }), U, 'a');
    expect(m.owners.a).toBe(U);
    expect(m.base.a).toBeUndefined();
    const m2 = linkParty(meta({ a: OTHER }, { a: { rev: 3, gen: G, localAt: 1 } }), U, 'a');
    expect(m2.owners.a).toBe(U);
    expect(m2.base.a).toBeUndefined();
  });
});

describe('noteAccount : compte supprimé puis même Google (nouvel uid)', () => {
  it('les parties de l\'ancien compte redeviennent sans compte (question reposée) ; les autres comptes ne bougent pas', () => {
    let m = meta({ a: 'old', b: 'old', t: OTHER, d: DEVICE }, { a: { rev: 2, gen: G, localAt: 1 }, t: { rev: 1, gen: G, localAt: 1 } }, { z: { rev: 1, gen: G, uid: 'old' } });
    m = noteAccount(m, 'old', 'Lea@X.ch').meta;
    expect(m.accounts).toEqual({ old: 'lea@x.ch' });
    m = noteAccount(m, OTHER, 'tom@x.ch').meta;
    const r = noteAccount(m, 'new', ' lea@x.ch ');
    expect(r.released.sort()).toEqual(['a', 'b']);
    expect(r.meta.owners).toEqual({ t: OTHER, d: DEVICE });
    expect(r.meta.base).toEqual({ t: { rev: 1, gen: G, localAt: 1 } });
    expect(r.meta.deleted).toEqual({});
    expect(r.meta.accounts).toEqual({ [OTHER]: 'tom@x.ch', new: 'lea@x.ch' });
    // Et la synchro du nouveau compte n'y touche pas d'elle-même : il faut demander.
    expect(planSync([{ id: 'a', updatedAt: 1 }, { id: 'b', updatedAt: 1 }], [], r.meta, 'new').unowned).toEqual(['a', 'b']);
  });

  it('même uid, ou sans e-mail : rien ne change', () => {
    const m = meta({ a: U }, {}, {}, { [U]: 'lea@x.ch' });
    expect(noteAccount(m, U, 'lea@x.ch').released).toEqual([]);
    expect(noteAccount(m, 'new', '').released).toEqual([]);
    expect(noteAccount(m, 'new', '').meta.owners).toEqual({ a: U });
  });
});

describe('planSync : une seule copie', () => {
  it('seulement ici, jamais envoyée : envoyer (création, rev 1)', () => {
    const plan = planSync([{ id: 'a', updatedAt: 10 }], [], meta({ a: U }), U);
    expect(plan.upload).toEqual([{ id: 'a', expect: null, gen: null }]);
  });

  it('seulement ici alors qu\'elle a été en ligne (« effacer mes parties en ligne ») : gardée ici, déliée, pas renvoyée', () => {
    const plan = planSync([{ id: 'a', updatedAt: 10 }], [], meta({ a: U }, { a: { rev: 4, gen: G, localAt: 10 } }), U);
    expect(plan.unlink).toEqual(['a']);
    empty(plan, ['unlink']);
  });

  it('seulement en ligne : récupérer (nouvel appareil)', () => {
    const plan = planSync([], [{ id: 'a', rev: 2, gen: G, updatedAt: 10 }], {}, U);
    expect(plan.download).toEqual([{ id: 'a', rev: 2, gen: G }]);
  });

  it('seulement en ligne, effacée ici sans être connecté (pas de pierre tombale à écrire) : elle revient', () => {
    const plan = planSync([], [{ id: 'a', rev: 2, gen: G, updatedAt: 10 }], meta({}, { a: { rev: 2, gen: G, localAt: 10 } }), U);
    expect(plan.download).toEqual([{ id: 'a', rev: 2, gen: G }]);
    expect(plan.tombstone).toEqual([]);
  });

  it('pierre tombale en ligne (v2 : gone ; v1 : deleted), rien ici : oublier', () => {
    for (const mark of [{ gone: true }, { deleted: true }]) {
      const plan = planSync([], [{ id: 'a', rev: 3, gen: G, ...mark }], meta({ a: U }, { a: { rev: 2, gen: G, localAt: 1 } }), U);
      expect(plan.forget).toEqual(['a']);
      empty(plan);
    }
  });

  it('id refusé en ligne : jamais envoyé ni récupéré', () => {
    const plan = planSync([{ id: 'a/b', updatedAt: 1 }], [{ id: 'é', rev: 1 }], meta({ 'a/b': U }), U);
    empty(plan);
  });
});

describe('planSync : les deux copies', () => {
  const m = meta({ a: U }, { a: { rev: 5, gen: G, localAt: 100 } });

  it('rien de changé : rien', () => {
    expect(planIsEmpty(planSync([{ id: 'a', updatedAt: 100 }], [{ id: 'a', rev: 5, gen: G, updatedAt: 999 }], m, U))).toBe(true);
  });

  it('changée seulement ici : envoyer (en attendant la rev et le gen de l\'accord)', () => {
    const plan = planSync([{ id: 'a', updatedAt: 50 }], [{ id: 'a', rev: 5, gen: G, updatedAt: 999 }], m, U);
    expect(plan.upload).toEqual([{ id: 'a', expect: 5, gen: G }]); // même si l'horloge d'ici « recule » (50 < 100)
  });

  it('changée seulement en ligne : remplacer ici (même si l\'autre horloge est en retard)', () => {
    const plan = planSync([{ id: 'a', updatedAt: 100 }], [{ id: 'a', rev: 6, gen: G, updatedAt: 1 }], m, U);
    expect(plan.download).toEqual([{ id: 'a', rev: 6, gen: G }]);
  });

  it('changée des deux côtés : conflit (on gardera les deux)', () => {
    const plan = planSync([{ id: 'a', updatedAt: 101 }], [{ id: 'a', rev: 6, gen: G, updatedAt: 1 }], m, U);
    expect(plan.conflict).toEqual([{ id: 'a', rev: 6, gen: G }]);
    empty(plan, ['conflict']);
  });

  it('jamais comparées (pas d\'accord) : conflit (même contenu → accord noté, sinon les deux gardées)', () => {
    const plan = planSync([{ id: 'a', updatedAt: 1 }], [{ id: 'a', rev: 1, gen: G, updatedAt: 1 }], meta({ a: U }), U);
    expect(plan.conflict).toEqual([{ id: 'a', rev: 1, gen: G }]);
  });

  it('horloges décalées dans les deux sens : seule l\'égalité compte', () => {
    for (const localAt of [0, 99, 101, 1e15]) {
      const plan = planSync([{ id: 'a', updatedAt: localAt }], [{ id: 'a', rev: 5, gen: G, updatedAt: 7 }], m, U);
      expect(plan.upload).toEqual([{ id: 'a', expect: 5, gen: G }]);
    }
    for (const remoteAt of [0, 99, 101, 1e15]) {
      const plan = planSync([{ id: 'a', updatedAt: 100 }], [{ id: 'a', rev: 6, gen: G, updatedAt: remoteAt }], m, U);
      expect(plan.download).toEqual([{ id: 'a', rev: 6, gen: G }]);
    }
  });

  it('même rev mais autre gen (effacée en ligne puis remise dans le compte) : changée en ligne, jamais écrasée', () => {
    // Changée ici aussi : conflit (les deux gardées), et non un envoi « rien n'a changé en ligne » par-dessus.
    const both = planSync([{ id: 'a', updatedAt: 150 }], [{ id: 'a', rev: 5, gen: 'gen-b', updatedAt: 1 }], m, U);
    expect(both.conflict).toEqual([{ id: 'a', rev: 5, gen: 'gen-b' }]);
    empty(both, ['conflict']);
    // Pas changée ici : la nouvelle version est récupérée.
    const theirs = planSync([{ id: 'a', updatedAt: 100 }], [{ id: 'a', rev: 5, gen: 'gen-b', updatedAt: 1 }], m, U);
    expect(theirs.download).toEqual([{ id: 'a', rev: 5, gen: 'gen-b' }]);
  });
});

describe('planSync : effacements', () => {
  it('pierre tombale en ligne, pas changée ici : effacer ici', () => {
    const plan = planSync([{ id: 'a', updatedAt: 100 }], [{ id: 'a', rev: 6, gen: G, gone: true }], meta({ a: U }, { a: { rev: 5, gen: G, localAt: 100 } }), U);
    expect(plan.removeLocal).toEqual([{ id: 'a', rev: 6 }]);
  });

  it('pierre tombale en ligne, changée ici : la renvoyer (elle revient)', () => {
    const plan = planSync([{ id: 'a', updatedAt: 3 }], [{ id: 'a', rev: 6, gen: G, gone: true }], meta({ a: U }, { a: { rev: 5, gen: G, localAt: 100 } }), U);
    expect(plan.upload).toEqual([{ id: 'a', expect: 6, gen: G }]);
    expect(plan.removeLocal).toEqual([]);
  });

  it('pierre tombale d\'un autre document que celui de l\'accord (autre gen) : renvoyée, jamais effacée', () => {
    const plan = planSync([{ id: 'a', updatedAt: 100 }], [{ id: 'a', rev: 2, gen: 'gen-b', gone: true }], meta({ a: U }, { a: { rev: 1, gen: G, localAt: 100 } }), U);
    expect(plan.upload).toEqual([{ id: 'a', expect: 2, gen: 'gen-b' }]);
    expect(plan.removeLocal).toEqual([]);
  });

  it('pierre tombale et partie ici jamais comparée (fichier restauré) : renvoyée, jamais effacée', () => {
    const plan = planSync([{ id: 'a', updatedAt: 1 }], [{ id: 'a', rev: 2, gen: G, gone: true }], meta({ a: U }), U);
    expect(plan.upload).toEqual([{ id: 'a', expect: 2, gen: G }]);
  });

  it('effacée ici par son propriétaire, rien n\'a changé en ligne : pierre tombale (rev + 1)', () => {
    const plan = planSync([], [{ id: 'a', rev: 5, gen: G }], meta({}, {}, { a: { rev: 5, gen: G, uid: U } }), U);
    expect(plan.tombstone).toEqual([{ id: 'a', expect: 5, gen: G }]);
    expect(plan.download).toEqual([]);
  });

  it('effacée ici, mais rejouée ailleurs depuis (ou recréée : autre gen) : elle revient', () => {
    const plan = planSync([], [{ id: 'a', rev: 6, gen: G }], meta({}, {}, { a: { rev: 5, gen: G, uid: U } }), U);
    expect(plan.download).toEqual([{ id: 'a', rev: 6, gen: G, revive: true }]);
    expect(plan.tombstone).toEqual([]);
    const again = planSync([], [{ id: 'a', rev: 5, gen: 'gen-b' }], meta({}, {}, { a: { rev: 5, gen: G, uid: U } }), U);
    expect(again.download).toEqual([{ id: 'a', rev: 5, gen: 'gen-b', revive: true }]);
  });

  it('effacée ici et déjà effacée (ou disparue) en ligne : la mémoire est oubliée', () => {
    expect(planSync([], [{ id: 'a', rev: 6, gen: G, gone: true }], meta({}, {}, { a: { rev: 5, gen: G, uid: U } }), U).forget).toEqual(['a']);
    expect(planSync([], [], meta({}, {}, { a: { rev: 5, gen: G, uid: U } }), U).forget).toEqual(['a']);
  });

  it('un effacement noté pour un autre compte ne touche pas celui-ci', () => {
    const plan = planSync([], [{ id: 'a', rev: 5, gen: G }], meta({}, {}, { a: { rev: 5, gen: G, uid: OTHER } }), U);
    expect(plan.tombstone).toEqual([]);
  });

  it('plus d\'effacement « deviné » : une partie disparue de l\'appareil n\'est jamais effacée en ligne', () => {
    const plan = planSync([], [{ id: 'a', rev: 5, gen: G }], meta({ a: U }, { a: { rev: 5, gen: G, localAt: 100 } }), U);
    expect(plan.tombstone).toEqual([]);
    expect(plan.download).toEqual([{ id: 'a', rev: 5, gen: G }]);
  });

  it('deleteKind : partout (compte connecté) ; « reviendra » seulement si pas jouée ici depuis la dernière synchro', () => {
    const m = meta({ a: U, b: OTHER, c: DEVICE, n: OTHER }, { a: { rev: 4, gen: G, localAt: 1 }, b: { rev: 1, gen: G, localAt: 7 } });
    expect(deleteKind(m, U, 'a', 1)).toBe('everywhere');
    expect(deleteKind(m, U, 'b', 7)).toBe('kept'); // autre compte, pas changée ici : la version en ligne reviendra
    expect(deleteKind(m, U, 'b', 8)).toBe('keptOld'); // jouée ici depuis : ces progrès seront perdus
    expect(deleteKind(m, null, 'a', 1)).toBe('kept'); // déconnecté
    expect(deleteKind(m, null, 'a', 2)).toBe('keptOld');
    expect(deleteKind(m, U, 'n', 1)).toBe('here'); // liée à un compte, mais jamais envoyée : rien ne reviendra
    expect(deleteKind(m, U, 'c', 1)).toBe('here');
    expect(deleteKind(m, U, 'z', 1)).toBe('here');
  });

  it('noteDeleted : pierre tombale à écrire seulement pour le compte connecté', () => {
    const m = meta({ a: U, b: OTHER }, { a: { rev: 4, gen: G, localAt: 1 }, b: { rev: 1, gen: G, localAt: 7 } });
    const after = noteDeleted(m, U, 'a');
    expect(after.deleted).toEqual({ a: { rev: 4, gen: G, uid: U } });
    expect(after.owners.a).toBeUndefined();
    expect(noteDeleted(m, U, 'b').deleted).toEqual({});
    const guest = noteDeleted(m, null, 'a');
    expect(guest.deleted).toEqual({});
    expect(guest.owners.a).toBeUndefined();
  });

  it('unlinkAccount (« effacer mes parties en ligne ») : les parties du compte restent, déliées', () => {
    const m = unlinkAccount(meta({ a: U, b: OTHER }, { a: { rev: 1, gen: G, localAt: 1 } }, { c: { rev: 2, gen: G, uid: U } }), U);
    expect(m.owners).toEqual({ a: DEVICE, b: OTHER });
    expect(m.base).toEqual({});
    expect(m.deleted).toEqual({});
  });
});

describe('planSync : parties ouvertes', () => {
  const m = meta({ a: U }, { a: { rev: 5, gen: G, localAt: 100 } });
  const open = { open: ['a'] };

  it('ouverte, changée ailleurs : rien n\'est envoyé ni remplacé, on prévient', () => {
    const plan = planSync([{ id: 'a', updatedAt: 200 }], [{ id: 'a', rev: 6, gen: G }], m, U, open);
    expect(plan.held).toEqual(['a']);
    empty(plan, ['held']);
    const plan2 = planSync([{ id: 'a', updatedAt: 100 }], [{ id: 'a', rev: 6, gen: G }], m, U, open);
    expect(plan2.held).toEqual(['a']);
    expect(plan2.download).toEqual([]);
  });

  it('ouverte, pas changée ailleurs : envoyée', () => {
    const plan = planSync([{ id: 'a', updatedAt: 200 }], [{ id: 'a', rev: 5, gen: G }], m, U, open);
    expect(plan.upload).toEqual([{ id: 'a', expect: 5, gen: G }]);
  });

  it('ouverte, effacée ailleurs : ni effacée ni renvoyée pendant qu\'on joue', () => {
    const plan = planSync([{ id: 'a', updatedAt: 100 }], [{ id: 'a', rev: 6, gen: G, gone: true }], m, U, open);
    empty(plan);
  });
});

describe('applyDone', () => {
  it('retient le compte et l\'accord (rev et gen en ligne, date locale)', () => {
    const m = applyDone({}, U, { synced: [{ id: 'a', rev: 1, gen: G, localAt: 10 }, { id: 'b', rev: 7, gen: 'gen-b', localAt: 20 }] });
    expect(m.owners).toEqual({ a: U, b: U });
    expect(m.base).toEqual({ a: { rev: 1, gen: G, localAt: 10 }, b: { rev: 7, gen: 'gen-b', localAt: 20 } });
  });

  it('oublie les parties effacées, délie celles qui ne sont plus en ligne', () => {
    const m = applyDone(meta({ a: U, b: U }, { a: { rev: 1, gen: G, localAt: 1 }, b: { rev: 1, gen: G, localAt: 1 } }, { c: { rev: 1, gen: G, uid: U } }), U, { removed: ['a', 'c'], unlinked: ['b'] });
    expect(m).toEqual({ v: 2, owners: { b: DEVICE }, base: {}, deleted: {}, accounts: {} });
  });

  it('partie effacée PENDANT la synchro (appliqué sur la mémoire relue) : reste à effacer, par-dessus notre envoi', () => {
    const fresh = meta({}, {}, { a: { rev: 3, gen: G, uid: U } });
    const m = applyDone(fresh, U, { synced: [{ id: 'a', rev: 4, gen: G, localAt: 10 }] });
    expect(m.deleted.a).toEqual({ rev: 4, gen: G, uid: U });
    expect(m.owners.a).toBeUndefined();
  });

  it('revenue après un effacement fait ici (rejouée ailleurs) : l\'effacement est oublié', () => {
    const m = applyDone(meta({}, {}, { a: { rev: 3, gen: G, uid: U } }), U, { synced: [{ id: 'a', rev: 4, gen: G, localAt: 10, revive: true }] });
    expect(m.deleted).toEqual({});
    expect(m.owners.a).toBe(U);
  });

  it('déliée pendant la synchro : reste déliée', () => {
    const m = applyDone(meta({ a: DEVICE }), U, { synced: [{ id: 'a', rev: 4, gen: G, localAt: 10 }] });
    expect(m.owners.a).toBe(DEVICE);
    expect(m.base.a).toBeUndefined();
  });
});
