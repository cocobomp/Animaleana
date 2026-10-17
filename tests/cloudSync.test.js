import { describe, it, expect } from 'vitest';
import { planSync, applyDone, noteDeleted, cleanMeta, planIsEmpty } from '../src/sim/cloudSync.js';

const U = 'uid-lea';
const OTHER = 'uid-tom';

describe('planSync', () => {
  it('première connexion : les parties de l\'appareil sont envoyées et deviennent celles du compte', () => {
    const plan = planSync([{ id: 'a', updatedAt: 10 }, { id: 'b', updatedAt: 20 }], [], {}, U);
    expect(plan.upload).toEqual(['a', 'b']);
    expect(plan.claim).toEqual(['a', 'b']);
    expect(plan.download).toEqual([]);
  });

  it('nouvel appareil : les parties en ligne sont récupérées', () => {
    const plan = planSync([], [{ id: 'a', updatedAt: 10 }, { id: 'x', updatedAt: 5, deleted: true }], {}, U);
    expect(plan.download).toEqual([{ id: 'a', conflict: false }]);
    expect(plan.upload).toEqual([]);
  });

  it('la version la plus récente gagne, dans les deux sens', () => {
    const meta = { owners: { a: U, b: U }, synced: { a: 10, b: 10 } };
    const plan = planSync([{ id: 'a', updatedAt: 30 }, { id: 'b', updatedAt: 10 }], [{ id: 'a', updatedAt: 10 }, { id: 'b', updatedAt: 40 }], meta, U);
    expect(plan.upload).toEqual(['a']);
    expect(plan.download).toEqual([{ id: 'b', conflict: false }]);
  });

  it('même date des deux côtés : rien à faire', () => {
    const meta = { owners: { a: U }, synced: { a: 10 } };
    const plan = planSync([{ id: 'a', updatedAt: 10 }], [{ id: 'a', updatedAt: 10 }], meta, U);
    expect(planIsEmpty(plan)).toBe(true);
  });

  it('modifiée des deux côtés depuis le dernier passage : conflit (copie de secours de l\'appareil)', () => {
    const meta = { owners: { a: U }, synced: { a: 10 } };
    const plan = planSync([{ id: 'a', updatedAt: 20 }], [{ id: 'a', updatedAt: 25 }], meta, U);
    expect(plan.download).toEqual([{ id: 'a', conflict: true }]);
  });

  it('jamais synchronisée mais déjà en ligne (fichier restauré) : conflit, rien n\'est perdu', () => {
    const plan = planSync([{ id: 'a', updatedAt: 5 }], [{ id: 'a', updatedAt: 9 }], {}, U);
    expect(plan.download).toEqual([{ id: 'a', conflict: true }]);
  });

  it('ne touche jamais aux parties d\'un autre compte sur l\'appareil', () => {
    const meta = { owners: { t: OTHER } };
    const plan = planSync([{ id: 't', updatedAt: 50 }], [], meta, U);
    expect(plan.upload).toEqual([]);
    expect(plan.claim).toEqual([]);
  });

  it('effacée sur l\'appareil : pierre tombale en ligne', () => {
    const meta = { owners: { a: U }, synced: { a: 10 }, deleted: { a: 15 } };
    const plan = planSync([], [{ id: 'a', updatedAt: 10 }], meta, U);
    expect(plan.removeRemote).toEqual([{ id: 'a', at: 15 }]);
    expect(plan.download).toEqual([]);
  });

  it('effacée ici mais rejouée ailleurs après : elle revient', () => {
    const meta = { owners: { a: U }, synced: { a: 10 }, deleted: { a: 15 } };
    const plan = planSync([], [{ id: 'a', updatedAt: 20 }], meta, U);
    expect(plan.download).toEqual([{ id: 'a', conflict: false }]);
    expect(plan.removeRemote).toEqual([]);
  });

  it('effacée ailleurs : effacée ici, sauf si on a joué avec depuis', () => {
    const meta = { owners: { a: U, b: U }, synced: { a: 10, b: 10 } };
    const plan = planSync(
      [{ id: 'a', updatedAt: 10 }, { id: 'b', updatedAt: 30 }],
      [{ id: 'a', updatedAt: 12, deleted: true }, { id: 'b', updatedAt: 12, deleted: true }], meta, U);
    expect(plan.removeLocal).toEqual(['a']);
    expect(plan.upload).toEqual(['b']);
  });

  it('effacement déjà fait en ligne : la mémoire est oubliée', () => {
    const meta = { owners: { a: U }, deleted: { a: 15 } };
    expect(planSync([], [{ id: 'a', updatedAt: 15, deleted: true }], meta, U).forget).toEqual(['a']);
    expect(planSync([], [], meta, U).forget).toEqual(['a']);
  });

  it('résiste à une mémoire abîmée et à des entrées vides', () => {
    const plan = planSync([null, { id: 'a' }], [undefined, { id: 'b', updatedAt: 'x' }], 'abîmé', U);
    expect(plan.upload).toEqual(['a']);
    expect(plan.download).toEqual([{ id: 'b', conflict: false }]);
  });
});

describe('mémoire de la synchro', () => {
  it('applyDone retient le compte et la date synchronisée', () => {
    const m = applyDone({}, U, { uploaded: [{ id: 'a', updatedAt: 10 }], downloaded: [{ id: 'b', updatedAt: 20 }], claimed: ['c'] });
    expect(m.owners).toEqual({ a: U, b: U, c: U });
    expect(m.synced).toEqual({ a: 10, b: 20 });
  });

  it('applyDone oublie les parties effacées', () => {
    const m = applyDone({ owners: { a: U, b: U }, synced: { a: 1, b: 1 }, deleted: { a: 2 } }, U, { removedRemote: ['a'], removedLocal: ['b'] });
    expect(m).toEqual({ owners: {}, synced: {}, deleted: {} });
  });

  it('noteDeleted : seulement pour une partie liée à un compte', () => {
    expect(noteDeleted({ owners: { a: U } }, 'a', 99).deleted).toEqual({ a: 99 });
    expect(noteDeleted({}, 'z', 99).deleted).toEqual({});
  });

  it('cleanMeta ne partage pas les objets d\'origine', () => {
    const src = { owners: { a: U } };
    const m = cleanMeta(src);
    m.owners.b = U;
    expect(src.owners).toEqual({ a: U });
  });
});

describe('effacement deviné', () => {
  it('partie synchronisée qui a disparu de l\'appareil : effacée en ligne si personne n\'y a touché', () => {
    const meta = { owners: { a: U }, synced: { a: 10 } };
    expect(planSync([], [{ id: 'a', updatedAt: 10 }], meta, U).removeRemote).toEqual([{ id: 'a', at: 11 }]);
  });

  it('… mais revient si elle a été modifiée ailleurs depuis', () => {
    const meta = { owners: { a: U }, synced: { a: 10 } };
    const plan = planSync([], [{ id: 'a', updatedAt: 20 }], meta, U);
    expect(plan.removeRemote).toEqual([]);
    expect(plan.download).toEqual([{ id: 'a', conflict: false }]);
  });

  it('jamais synchronisée : rien n\'est deviné', () => {
    const meta = { owners: { a: U } };
    expect(planSync([], [{ id: 'a', updatedAt: 20 }], meta, U).download).toEqual([{ id: 'a', conflict: false }]);
  });
});
