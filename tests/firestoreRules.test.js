// Les règles de firestore.rules, testées dans l'émulateur Firestore (vrai moteur de règles) : rev + 1
// obligatoire, rev 1 à la création, un compte ne touche jamais aux parties d'un autre, champs et tailles contrôlés.
// Sans émulateur, ces tests sont sautés. Pour les lancer (voir docs/HEBERGEMENT.md) :
//   npx firebase-tools emulators:start --only firestore   (avec firebase.json → firestore.rules)
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run tests/firestoreRules.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'lafermeamadichelle';

describe.skipIf(!HOST)('firestore.rules (émulateur)', () => {
  let fs;
  let lea;
  let tom;
  let anon;
  const apps = [];
  const base = () => `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
  const save = (rev, extra = {}) => ({ data: JSON.stringify({ id: 'p1', name: 'Léa' }), updatedAt: 1760000000000, rev, name: 'Léa', saveVersion: 1, appVersion: '0.4.0', ...extra });
  const ok = async (p) => { await p; return true; };
  const denied = async (p) => {
    try {
      await p;
      return false;
    } catch (err) {
      return err?.code === 'permission-denied';
    }
  };

  beforeAll(async () => {
    const { initializeApp, deleteApp } = await import('firebase/app');
    fs = await import('firebase/firestore');
    const [host, port] = HOST.split(':');
    const db = (name, sub) => {
      const app = initializeApp({ projectId: PROJECT, apiKey: 'x' }, name);
      apps.push([app, deleteApp]);
      const d = fs.getFirestore(app);
      fs.connectFirestoreEmulator(d, host, Number(port), sub ? { mockUserToken: { sub, user_id: sub } } : {});
      return d;
    };
    lea = db('lea', 'lea');
    tom = db('tom', 'tom');
    anon = db('anon', null);
    await fetch(base(), { method: 'DELETE', headers: { Authorization: 'Bearer owner' } }).catch(() => {});
    await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  });
  afterAll(async () => {
    for (const [app, del] of apps) await del(app).catch(() => {});
  });

  const ref = (db, uid, id) => fs.doc(db, 'users', uid, 'saves', id);

  it('création : seulement avec rev 1', async () => {
    expect(await denied(fs.setDoc(ref(lea, 'lea', 'a'), save(2)))).toBe(true);
    expect(await denied(fs.setDoc(ref(lea, 'lea', 'a'), save(0)))).toBe(true);
    const { rev, ...noRev } = save(1);
    expect(rev).toBe(1);
    expect(await denied(fs.setDoc(ref(lea, 'lea', 'a'), noRev))).toBe(true);
    expect(await ok(fs.setDoc(ref(lea, 'lea', 'a'), save(1)))).toBe(true);
  });

  it('mise à jour : seulement la rev suivante (une écriture faite sur une version dépassée est refusée)', async () => {
    expect(await denied(fs.setDoc(ref(lea, 'lea', 'a'), save(1)))).toBe(true); // même rev
    expect(await denied(fs.setDoc(ref(lea, 'lea', 'a'), save(3)))).toBe(true); // saute une rev
    expect(await ok(fs.setDoc(ref(lea, 'lea', 'a'), save(2)))).toBe(true);
    expect(await ok(fs.setDoc(ref(lea, 'lea', 'a'), { data: '', updatedAt: 5, rev: 3, deleted: true }))).toBe(true); // pierre tombale
  });

  it('transaction (comme le jeu) : relit puis écrit rev + 1', async () => {
    const rev = await fs.runTransaction(lea, async (tx) => {
      const snap = await tx.get(ref(lea, 'lea', 'a'));
      const next = snap.data().rev + 1;
      tx.set(ref(lea, 'lea', 'a'), save(next));
      return next;
    });
    expect(rev).toBe(4);
  });

  it('un autre compte ne lit, n\'écrit ni n\'efface rien chez Léa ; sans compte, rien', async () => {
    expect(await denied(fs.getDoc(ref(tom, 'lea', 'a')))).toBe(true);
    expect(await denied(fs.getDocs(fs.collection(tom, 'users', 'lea', 'saves')))).toBe(true);
    expect(await denied(fs.setDoc(ref(tom, 'lea', 'a'), save(5)))).toBe(true);
    expect(await denied(fs.setDoc(ref(tom, 'lea', 'z'), save(1)))).toBe(true);
    expect(await denied(fs.deleteDoc(ref(tom, 'lea', 'a')))).toBe(true);
    expect(await denied(fs.getDoc(ref(anon, 'lea', 'a')))).toBe(true);
    expect(await denied(fs.setDoc(ref(anon, 'lea', 'y'), save(1)))).toBe(true);
    expect(await ok(fs.getDoc(ref(lea, 'lea', 'a')))).toBe(true);
  });

  it('champs et tailles contrôlés ; identifiant de partie limité', async () => {
    expect(await denied(fs.setDoc(ref(lea, 'lea', 'b'), { ...save(1), admin: true }))).toBe(true);
    expect(await denied(fs.setDoc(ref(lea, 'lea', 'b'), { ...save(1), updatedAt: 'hier' }))).toBe(true);
    expect(await denied(fs.setDoc(ref(lea, 'lea', 'b'), { ...save(1), rev: 1.5 }))).toBe(true);
    expect(await denied(fs.setDoc(ref(lea, 'lea', 'b'), { ...save(1), data: 'x'.repeat(900001) }))).toBe(true);
    expect(await denied(fs.setDoc(ref(lea, 'lea', 'b'), { ...save(1), name: 'x'.repeat(61) }))).toBe(true);
    expect(await denied(fs.setDoc(ref(lea, 'lea', 'é'), save(1)))).toBe(true);
    expect(await denied(fs.setDoc(ref(lea, 'lea', 'x'.repeat(65)), save(1)))).toBe(true);
    expect(await ok(fs.setDoc(ref(lea, 'lea', 'Ab_9-z'), save(1)))).toBe(true);
    expect(await denied(fs.setDoc(fs.doc(lea, 'users', 'lea'), { a: 1 }))).toBe(true);
    expect(await denied(fs.setDoc(fs.doc(lea, 'public', 'x'), { a: 1 }))).toBe(true);
  });

  it('document de la première version (sans rev) : compté comme rev 0 → mis à jour en rev 1', async () => {
    // Écrit « par l'administrateur » (sans règles), comme les documents d'avant les rev.
    const r = await fetch(`${base()}/users/lea/saves/old`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { data: { stringValue: '{}' }, updatedAt: { integerValue: '1' } } }),
    });
    expect(r.ok).toBe(true);
    expect(await denied(fs.setDoc(ref(lea, 'lea', 'old'), save(2)))).toBe(true);
    expect(await ok(fs.setDoc(ref(lea, 'lea', 'old'), save(1)))).toBe(true);
  });

  it('le propriétaire peut tout effacer (« effacer mes parties en ligne »)', async () => {
    expect(await ok(fs.deleteDoc(ref(lea, 'lea', 'a')))).toBe(true);
    expect(await ok(fs.deleteDoc(ref(lea, 'lea', 'old')))).toBe(true);
  });
});
