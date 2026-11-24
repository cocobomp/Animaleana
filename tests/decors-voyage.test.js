// En voyage, le décor du soin montre le lieu du voyage : la famille de chaque lieu (setting.js : awayLook, AWAY_LOOKS),
// ses objets du jour, et le fond posé loin derrière l'animal (away.js : dressAway) — le sable et la mer à la plage, les
// sommets à la montagne… Tout ce qui est ajouté est libéré, le sol retrouve sa couleur.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as THREE from 'three';
import { awayLook, AWAY_LOOKS, EXTRAS, EXTRAS_OF, extrasPlace, pickExtras, careAmbience, careSetting } from '../src/game/care/setting.js';
import { PLACES, PLACE_IDS } from '../src/sim/places.js';
import { loadFarm, farmStage } from './fixtures/farmStage.js';

describe('les lieux de voyage (pur)', () => {
  it('chaque lieu du monde a sa famille de décor ; un lieu inconnu garde le décor dehors habituel', () => {
    for (const id of PLACE_IDS) {
      const look = awayLook(id);
      expect(AWAY_LOOKS[look], id).toBeTruthy();
    }
    expect(awayLook('bretagne')).toBe('plage');
    expect(awayLook('alpes')).toBe('montagne');
    expect(awayLook('islande')).toBe('volcan');
    expect(awayLook('canada')).toBe('rocheuses');
    expect(awayLook('pampa')).toBe('pampa');
    expect(awayLook('japon')).toBe('japon');
    expect(awayLook('andalousie')).toBe('mediterranee');
    expect(awayLook('australie')).toBe('bush');
    expect(awayLook('angleterre')).toBe('cottage');
    expect(awayLook('kentucky')).toBe('haras');
    expect(awayLook('camping')).toBe(null);
    expect(awayLook(undefined)).toBe(null);
    // (toutes les familles servent)
    expect(new Set(PLACE_IDS.map(awayLook)).size).toBe(Object.keys(AWAY_LOOKS).length);
    expect(PLACES.bretagne.sea).toBe(true);
  });

  it('les objets du jour du voyage : ceux du lieu (coquillages à la plage, sapin à la montagne), au moins quatre par lieu', () => {
    for (const look of Object.keys(AWAY_LOOKS)) {
      const key = extrasPlace('ailleurs', look);
      expect(key).toBe(`ailleurs-${look}`);
      expect(EXTRAS_OF[key].length).toBeGreaterThanOrEqual(4);
      for (const k of EXTRAS_OF[key]) expect(EXTRAS[k], k).toBeTruthy();
      const seen = new Set();
      for (let day = 1; day <= 20; day++) for (const k of pickExtras({ day, id: 'h1', place: key })) seen.add(k);
      for (const k of seen) expect(EXTRAS_OF[key]).toContain(k);
    }
    expect(extrasPlace('pre', 'plage')).toBe('pre');
    expect(extrasPlace('ailleurs', null)).toBe('ailleurs');
    expect(EXTRAS_OF['ailleurs-plage']).toContain('coquillage');
    expect(EXTRAS_OF['ailleurs-montagne']).toContain('sapin');
    // (la nuit, ni mouette ni crabe)
    const night = careAmbience({ hour: 23 });
    for (let day = 1; day <= 20; day++) {
      const a = pickExtras({ day, id: 'h1', place: 'ailleurs-plage', amb: night });
      expect(a).not.toContain('mouette');
      expect(a).not.toContain('crabe');
    }
  });

  it('le décor du soin suit le lieu du voyage du jeu', async () => {
    const { careDecor } = await import('../src/ui/minigames/care3d.js');
    const a = { id: 'h9', species: 'horse', location: 'bretagne', needs: {} };
    const game = { profile: { home: 'maison', place: 'bretagne', animals: [a] }, day: 4, hour: 11, weather: 'clear', season: 'summer', entities: { get: () => null } };
    expect(careSetting(game, a, 'feed')).toBe('ailleurs');
    const d = careDecor(game, a, 'feed');
    expect(d.place).toBe('ailleurs');
    expect(d.look).toBe('plage');
    for (const k of d.kinds) expect(AWAY_LOOKS.plage.extras).toContain(k);
    // (à la maison : pas de voyage)
    game.profile.place = 'maison';
    a.location = 'maison';
    expect(careDecor(game, a, 'feed').look).toBe(null);
  }, 60000);
});

describe('le fond du lieu de voyage dans la scène', () => {
  let decorFor;
  let farmFeed;
  beforeAll(async () => {
    await loadFarm();
    ({ decorFor } = await import('../src/ui/minigames/care3d.js'));
    ({ farmFeed3dGame: farmFeed } = await import('../src/ui/minigames/farm3d.js'));
  }, 120000);
  afterEach(() => new Promise((resolve) => setImmediate(resolve)));

  const amb = careAmbience({ hour: 11, weather: 'clear', season: 'summer' });

  for (const look of Object.keys(AWAY_LOOKS)) {
    it(`${look} : le fond du lieu loin derrière l'animal, les arbres de la ferme cachés ; tout est rendu à la fermeture`, () => {
      const { sc } = farmStage({ species: 'cow', set: decorFor('cow', 'ailleurs', { amb, look, kinds: [], seed: 2 }) });
      const D = sc.decor;
      expect(D.place).toBe('ailleurs');
      expect(D.away?.look).toBe(look);
      // les arbres et collines de la ferme : cachés
      const far = [];
      D.group.traverse((o) => o.userData?.far && far.push(o));
      expect(far.length).toBeGreaterThan(0);
      for (const o of far) expect(o.visible).toBe(false);
      // le fond : quelques dizaines de pièces au plus (les arbres en instances), toutes derrière l'animal
      const W = D.away.group;
      let meshes = 0;
      const box = new THREE.Box3().setFromObject(sc.model.coatMesh ?? sc.holder);
      W.updateWorldMatrix(true, true);
      W.traverse((o) => {
        if (!o.isMesh && !o.isSprite) return;
        meshes++;
        const b = new THREE.Box3().setFromObject(o);
        expect(b.max.z, `${look} : ${o.type} derrière l'animal`).toBeLessThan(box.min.z - 1);
      });
      expect(meshes).toBeGreaterThan(3);
      expect(meshes).toBeLessThan(90);
      // le sol de la plage, du bush : du sable, de la terre rouge (sans herbe)
      const main = D.ground.find((m) => m.userData?.main);
      const before = { color: main.color.getHex(), map: main.map };
      if (look === 'plage' || look === 'bush') {
        expect(main.map).not.toBe(null);
        const grass = [];
        D.group.traverse((o) => o.userData?.grass && grass.push(o));
        for (const o of grass) expect(o.visible).toBe(false);
      }
      // ça bouge un peu (l'écume, le voilier, la fumée, l'éolienne, le kangourou) sans erreur
      for (let i = 0; i < 20; i++) sc.update(1 / 30);
      const geos = new Set();
      // (sauf la forme des bouffées de fumée : celle, partagée, de three.js)
      W.traverse((o) => o.geometry && !o.isSprite && geos.add(o.geometry));
      let freed = 0;
      for (const g of geos) g.addEventListener('dispose', () => freed++);
      sc.dispose();
      expect(W.parent).toBeNull();
      expect(freed).toBe(geos.size);
      for (const o of far) expect(o.visible).toBe(true);
    });
  }

  it('la plage : le sol devient sable, puis redevient herbe ; la mer et l\'écume sont là', () => {
    const { sc, ctx } = farmStage({ species: 'sheep', set: decorFor('sheep', 'ailleurs', { amb, look: 'plage', kinds: ['coquillage', 'crabe', 'mouette'], seed: 5 }) });
    const D = sc.decor;
    const main = D.ground.find((m) => m.userData?.main);
    // (le décor de base est construit avant le fond : on compare avec un pré ordinaire)
    const { sc: sc2 } = farmStage({ species: 'sheep', set: decorFor('sheep', 'pre', { amb, kinds: [], seed: 5 }) });
    const grassMain = sc2.decor.ground.find((m) => m.userData?.main);
    expect(main.color.getHex()).not.toBe(grassMain.color.getHex());
    expect(main.map).not.toBe(null);
    let sea = false;
    D.away.group.traverse((o) => {
      if (o.isMesh && o.geometry?.parameters?.width === 140 && o.geometry.parameters.height === 80) sea = true;
    });
    expect(sea).toBe(true);
    const game = farmFeed(ctx);
    for (let i = 0; i < 60; i++) {
      ctx.time += 1 / 30;
      game.update(1 / 30);
      sc.update(1 / 30);
    }
    game.destroy();
    const savedMap = main.map;
    sc.dispose();
    expect(main.map).not.toBe(savedMap);
    expect(main.color.getHex()).toBe(grassMain.color.getHex());
    sc2.dispose();
  });

  it('chien au jardin et cheval au pré, en voyage : le décor dehors de leur espèce, habillé du lieu', async () => {
    const { loadPets, makePetStage } = await import('./fixtures/petStage.js');
    await loadPets();
    const { sc } = makePetStage({ species: 'dog', set: decorFor('dog', 'ailleurs', { amb, look: 'montagne', kinds: ['sapin', 'rocher'], seed: 3 }) });
    expect(sc.decor.kind).toBe('jardin');
    expect(sc.decor.away.look).toBe('montagne');
    sc.dispose();
  }, 60000);
});
