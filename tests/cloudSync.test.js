// Synchro v2, le plan (module pur src/sim/cloudSync.js) : décisions par « ce qui a changé depuis le dernier
// accord » (égalités), jamais par l'heure de deux appareils.
import { describe, it, expect } from 'vitest';
import {
  planSync, applyDone, cleanMeta, planIsEmpty, claimParties, linkParty, deleteKind, noteDeleted, unlinkAccount, revOf, validId, DEVICE,
} from '../src/sim/cloudSync.js';

const U = 'uid-lea';
const OTHER = 'uid-tom';
const meta = (owners = {}, base = {}, deleted = {}) => ({ v: 2, owners, base, deleted });
const empty = (plan, except = []) => {
  for (const k of ['upload', 'download', 'conflict', 'tombstone', 'removeLocal', 'unlink', 'held']) if (!except.includes(k)) expect(plan[k], k).toEqual([]);
};

describe('mémoire v2', () => {
  it('mémoire vide, abîmée ou de la v1 : remise à zéro (rien n\'est perdu, la synchro recompare)', () => {
    const zero = { v: 2, owners: {}, base: {}, deleted: {} };
    expect(cleanMeta(undefined)).toEqual(zero);
    expect(cleanMeta('abîmé')).toEqual(zero);
    expect(cleanMeta({ owners: { a: U }, synced: { a: 10 }, deleted: { b: 5 } })).toEqual(zero); // v1
  });

  it('garde les entrées valides, jette les abîmées', () => {
    const m = cleanMeta({ v: 2, owners: { a: U, b: 3 }, base: { a: { rev: 2, localAt: 9 }, b: { rev: 'x' } }, deleted: { c: { rev: 1, uid: U }, d: {} } });
    expect(m).toEqual({ v: 2, owners: { a: U }, base: { a: { rev: 2, localAt: 9 } }, deleted: { c: { rev: 1, uid: U } } });
  });

  it('cleanMeta ne partage pas les objets d\'origine', () => {
    const src = meta({ a: U });
    const m = cleanMeta(src);
    m.owners.b = U;
    expect(src.owners).toEqual({ a: U });
  });

  it('revOf : documents sans rev (v1) = 0', () => {
    expect(revOf({})).toBe(0);
    expect(revOf({ rev: 3 })).toBe(3);
    expect(revOf({ rev: 'x' })).toBe(0);
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
    const plan = planSync([{ id: 'd', updatedAt: 1 }, { id: 't', updatedAt: 2 }], [{ id: 'd', rev: 3, updatedAt: 5 }, { id: 't', rev: 1 }], meta({ d: DEVICE, t: OTHER }), U);
    empty(plan);
    expect(plan.unowned).toEqual([]);
  });

  it('claimParties : cochées → ce compte, les autres → gardées sur l\'appareil', () => {
    const m = claimParties({}, U, ['a', 'b', 'c'], ['a', 'c']);
    expect(m.owners).toEqual({ a: U, b: DEVICE, c: U });
    // Puis la synchro les envoie (rev 1), sans toucher à b.
    const plan = planSync([{ id: 'a', updatedAt: 1 }, { id: 'b', updatedAt: 1 }, { id: 'c', updatedAt: 1 }], [], m, U);
    expect(plan.upload).toEqual([{ id: 'a', expect: null }, { id: 'c', expect: null }]);
  });

  it('claimParties ne change pas une partie déjà liée', () => {
    expect(claimParties(meta({ a: OTHER }), U, ['a'], ['a']).owners.a).toBe(OTHER);
  });

  it('linkParty (« Mettre dans mon compte », partie créée connecté) : liée, jamais comparée', () => {
    const m = linkParty(meta({ a: DEVICE }, { a: { rev: 1, localAt: 1 } }), U, 'a');
    expect(m.owners.a).toBe(U);
    expect(m.base.a).toBeUndefined();
  });
});

describe('planSync : une seule copie', () => {
  it('seulement ici, jamais envoyée : envoyer (création, rev 1)', () => {
    const plan = planSync([{ id: 'a', updatedAt: 10 }], [], meta({ a: U }), U);
    expect(plan.upload).toEqual([{ id: 'a', expect: null }]);
  });

  it('seulement ici alors qu\'elle a été en ligne (« effacer mes parties en ligne ») : gardée ici, déliée, pas renvoyée', () => {
    const plan = planSync([{ id: 'a', updatedAt: 10 }], [], meta({ a: U }, { a: { rev: 4, localAt: 10 } }), U);
    expect(plan.unlink).toEqual(['a']);
    empty(plan, ['unlink']);
  });

  it('seulement en ligne : récupérer (nouvel appareil)', () => {
    const plan = planSync([], [{ id: 'a', rev: 2, updatedAt: 10 }], {}, U);
    expect(plan.download).toEqual([{ id: 'a', rev: 2 }]);
  });

  it('seulement en ligne, effacée ici sans être connecté (pas de pierre tombale à écrire) : elle revient', () => {
    const plan = planSync([], [{ id: 'a', rev: 2, updatedAt: 10 }], meta({}, { a: { rev: 2, localAt: 10 } }), U);
    expect(plan.download).toEqual([{ id: 'a', rev: 2 }]);
    expect(plan.tombstone).toEqual([]);
  });

  it('pierre tombale en ligne, rien ici : oublier', () => {
    const plan = planSync([], [{ id: 'a', rev: 3, deleted: true }], meta({ a: U }, { a: { rev: 2, localAt: 1 } }), U);
    expect(plan.forget).toEqual(['a']);
    empty(plan);
  });

  it('id refusé en ligne : jamais envoyé ni récupéré', () => {
    const plan = planSync([{ id: 'a/b', updatedAt: 1 }], [{ id: 'é', rev: 1 }], meta({ 'a/b': U }), U);
    empty(plan);
  });
});

describe('planSync : les deux copies', () => {
  const m = meta({ a: U }, { a: { rev: 5, localAt: 100 } });

  it('rien de changé : rien', () => {
    expect(planIsEmpty(planSync([{ id: 'a', updatedAt: 100 }], [{ id: 'a', rev: 5, updatedAt: 999 }], m, U))).toBe(true);
  });

  it('changée seulement ici : envoyer (en attendant la rev de l\'accord)', () => {
    const plan = planSync([{ id: 'a', updatedAt: 50 }], [{ id: 'a', rev: 5, updatedAt: 999 }], m, U);
    expect(plan.upload).toEqual([{ id: 'a', expect: 5 }]); // même si l'horloge d'ici « recule » (50 < 100)
  });

  it('changée seulement en ligne : remplacer ici (même si l\'autre horloge est en retard)', () => {
    const plan = planSync([{ id: 'a', updatedAt: 100 }], [{ id: 'a', rev: 6, updatedAt: 1 }], m, U);
    expect(plan.download).toEqual([{ id: 'a', rev: 6 }]);
  });

  it('changée des deux côtés : conflit (on gardera les deux)', () => {
    const plan = planSync([{ id: 'a', updatedAt: 101 }], [{ id: 'a', rev: 6, updatedAt: 1 }], m, U);
    expect(plan.conflict).toEqual([{ id: 'a', rev: 6 }]);
    empty(plan, ['conflict']);
  });

  it('jamais comparées (pas d\'accord) : conflit (même contenu → accord noté, sinon les deux gardées)', () => {
    const plan = planSync([{ id: 'a', updatedAt: 1 }], [{ id: 'a', rev: 1, updatedAt: 1 }], meta({ a: U }), U);
    expect(plan.conflict).toEqual([{ id: 'a', rev: 1 }]);
  });

  it('horloges décalées dans les deux sens : seule l\'égalité compte', () => {
    for (const localAt of [0, 99, 101, 1e15]) {
      const plan = planSync([{ id: 'a', updatedAt: localAt }], [{ id: 'a', rev: 5, updatedAt: 7 }], m, U);
      expect(plan.upload).toEqual([{ id: 'a', expect: 5 }]);
    }
    for (const remoteAt of [0, 99, 101, 1e15]) {
      const plan = planSync([{ id: 'a', updatedAt: 100 }], [{ id: 'a', rev: 6, updatedAt: remoteAt }], m, U);
      expect(plan.download).toEqual([{ id: 'a', rev: 6 }]);
    }
  });
});

describe('planSync : effacements', () => {
  it('pierre tombale en ligne, pas changée ici : effacer ici', () => {
    const plan = planSync([{ id: 'a', updatedAt: 100 }], [{ id: 'a', rev: 6, deleted: true }], meta({ a: U }, { a: { rev: 5, localAt: 100 } }), U);
    expect(plan.removeLocal).toEqual([{ id: 'a', rev: 6 }]);
  });

  it('pierre tombale en ligne, changée ici : la renvoyer (elle revient)', () => {
    const plan = planSync([{ id: 'a', updatedAt: 3 }], [{ id: 'a', rev: 6, deleted: true }], meta({ a: U }, { a: { rev: 5, localAt: 100 } }), U);
    expect(plan.upload).toEqual([{ id: 'a', expect: 6 }]);
    expect(plan.removeLocal).toEqual([]);
  });

  it('pierre tombale et partie ici jamais comparée (fichier restauré) : renvoyée, jamais effacée', () => {
    const plan = planSync([{ id: 'a', updatedAt: 1 }], [{ id: 'a', rev: 2, deleted: true }], meta({ a: U }), U);
    expect(plan.upload).toEqual([{ id: 'a', expect: 2 }]);
  });

  it('effacée ici par son propriétaire, rien n\'a changé en ligne : pierre tombale (rev + 1)', () => {
    const plan = planSync([], [{ id: 'a', rev: 5 }], meta({}, {}, { a: { rev: 5, uid: U } }), U);
    expect(plan.tombstone).toEqual([{ id: 'a', expect: 5 }]);
    expect(plan.download).toEqual([]);
  });

  it('effacée ici, mais rejouée ailleurs depuis : elle revient', () => {
    const plan = planSync([], [{ id: 'a', rev: 6 }], meta({}, {}, { a: { rev: 5, uid: U } }), U);
    expect(plan.download).toEqual([{ id: 'a', rev: 6, revive: true }]);
    expect(plan.tombstone).toEqual([]);
  });

  it('effacée ici et déjà effacée (ou disparue) en ligne : la mémoire est oubliée', () => {
    expect(planSync([], [{ id: 'a', rev: 6, deleted: true }], meta({}, {}, { a: { rev: 5, uid: U } }), U).forget).toEqual(['a']);
    expect(planSync([], [], meta({}, {}, { a: { rev: 5, uid: U } }), U).forget).toEqual(['a']);
  });

  it('un effacement noté pour un autre compte ne touche pas celui-ci', () => {
    const plan = planSync([], [{ id: 'a', rev: 5 }], meta({}, {}, { a: { rev: 5, uid: OTHER } }), U);
    expect(plan.tombstone).toEqual([]);
  });

  it('plus d\'effacement « deviné » : une partie disparue de l\'appareil n\'est jamais effacée en ligne', () => {
    const plan = planSync([], [{ id: 'a', rev: 5 }], meta({ a: U }, { a: { rev: 5, localAt: 100 } }), U);
    expect(plan.tombstone).toEqual([]);
    expect(plan.download).toEqual([{ id: 'a', rev: 5 }]);
  });

  it('deleteKind / noteDeleted : liée au compte connecté → partout ; autre compte → ici seulement ; invité → ici', () => {
    const m = meta({ a: U, b: OTHER, c: DEVICE }, { a: { rev: 4, localAt: 1 }, b: { rev: 1, localAt: 1 } });
    expect(deleteKind(m, U, 'a')).toBe('everywhere');
    expect(deleteKind(m, U, 'b')).toBe('kept');
    expect(deleteKind(m, null, 'a')).toBe('kept'); // déconnecté : elle reviendra à la connexion
    expect(deleteKind(m, U, 'c')).toBe('here');
    expect(deleteKind(m, U, 'z')).toBe('here');
    const after = noteDeleted(m, U, 'a');
    expect(after.deleted).toEqual({ a: { rev: 4, uid: U } });
    expect(after.owners.a).toBeUndefined();
    const guest = noteDeleted(m, null, 'a');
    expect(guest.deleted).toEqual({});
    expect(guest.owners.a).toBeUndefined();
  });

  it('unlinkAccount (« effacer mes parties en ligne ») : les parties du compte restent, déliées', () => {
    const m = unlinkAccount(meta({ a: U, b: OTHER }, { a: { rev: 1, localAt: 1 } }, { c: { rev: 2, uid: U } }), U);
    expect(m.owners).toEqual({ a: DEVICE, b: OTHER });
    expect(m.base).toEqual({});
    expect(m.deleted).toEqual({});
  });
});

describe('planSync : parties ouvertes', () => {
  const m = meta({ a: U }, { a: { rev: 5, localAt: 100 } });
  const open = { open: ['a'] };

  it('ouverte, changée ailleurs : rien n\'est envoyé ni remplacé, on prévient', () => {
    const plan = planSync([{ id: 'a', updatedAt: 200 }], [{ id: 'a', rev: 6 }], m, U, open);
    expect(plan.held).toEqual(['a']);
    empty(plan, ['held']);
    const plan2 = planSync([{ id: 'a', updatedAt: 100 }], [{ id: 'a', rev: 6 }], m, U, open);
    expect(plan2.held).toEqual(['a']);
    expect(plan2.download).toEqual([]);
  });

  it('ouverte, pas changée ailleurs : envoyée', () => {
    const plan = planSync([{ id: 'a', updatedAt: 200 }], [{ id: 'a', rev: 5 }], m, U, open);
    expect(plan.upload).toEqual([{ id: 'a', expect: 5 }]);
  });

  it('ouverte, effacée ailleurs : ni effacée ni renvoyée pendant qu\'on joue', () => {
    const plan = planSync([{ id: 'a', updatedAt: 100 }], [{ id: 'a', rev: 6, deleted: true }], m, U, open);
    empty(plan);
  });
});

describe('applyDone', () => {
  it('retient le compte et l\'accord (rev en ligne, date locale)', () => {
    const m = applyDone({}, U, { synced: [{ id: 'a', rev: 1, localAt: 10 }, { id: 'b', rev: 7, localAt: 20 }] });
    expect(m.owners).toEqual({ a: U, b: U });
    expect(m.base).toEqual({ a: { rev: 1, localAt: 10 }, b: { rev: 7, localAt: 20 } });
  });

  it('oublie les parties effacées, délie celles qui ne sont plus en ligne', () => {
    const m = applyDone(meta({ a: U, b: U }, { a: { rev: 1, localAt: 1 }, b: { rev: 1, localAt: 1 } }, { c: { rev: 1, uid: U } }), U, { removed: ['a', 'c'], unlinked: ['b'] });
    expect(m).toEqual({ v: 2, owners: { b: DEVICE }, base: {}, deleted: {} });
  });

  it('partie effacée PENDANT la synchro (appliqué sur la mémoire relue) : reste à effacer, par-dessus notre envoi', () => {
    const fresh = meta({}, {}, { a: { rev: 3, uid: U } });
    const m = applyDone(fresh, U, { synced: [{ id: 'a', rev: 4, localAt: 10 }] });
    expect(m.deleted.a).toEqual({ rev: 4, uid: U });
    expect(m.owners.a).toBeUndefined();
  });

  it('revenue après un effacement fait ici (rejouée ailleurs) : l\'effacement est oublié', () => {
    const m = applyDone(meta({}, {}, { a: { rev: 3, uid: U } }), U, { synced: [{ id: 'a', rev: 4, localAt: 10, revive: true }] });
    expect(m.deleted).toEqual({});
    expect(m.owners.a).toBe(U);
  });

  it('déliée pendant la synchro : reste déliée', () => {
    const m = applyDone(meta({ a: DEVICE }), U, { synced: [{ id: 'a', rev: 4, localAt: 10 }] });
    expect(m.owners.a).toBe(DEVICE);
    expect(m.base.a).toBeUndefined();
  });
});
