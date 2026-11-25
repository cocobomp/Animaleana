// En voyage, le décor du soin montre le lieu du voyage : la famille de chaque lieu (setting.js : awayLook, AWAY_LOOKS),
// ses objets du jour, et le fond posé loin derrière l'animal (away.js : dressAway) — le sable et la mer à la plage, les
// sommets à la montagne, le bocage en Normandie… Le chien, le chat et le lapin n'ont plus la façade de la maison ni le
// clapier de la ferme ; la balle de la chèvre et la longe prennent aussi le lieu ; la nuit, la neige et la saison le
// suivent ; rien n'est planté dans la mer ; pas d'ombres au loin, moins de pièces en qualité basse ; la construction du
// pays ne tombe jamais juste derrière sa tête. Tout ce qui est ajouté est libéré, le sol retrouve sa couleur.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as THREE from 'three';
import { awayLook, AWAY_LOOKS, EXTRAS, EXTRAS_OF, extrasPlace, pickExtras, careAmbience, careSetting, hashSeed } from '../src/game/care/setting.js';
import { PLACES, PLACE_IDS } from '../src/sim/places.js';
import { gfx } from '../src/game/gfx.js';
import { loadFarm, farmStage, run } from './fixtures/farmStage.js';
import { fakeCtx as fakeCtxOf } from './fixtures/careCtx.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

const LOOKS = Object.keys(AWAY_LOOKS);

describe('les lieux de voyage (pur)', () => {
  it('chaque lieu du monde a sa propre famille de décor ; un lieu inconnu garde le décor dehors habituel', () => {
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
    // (la Normandie, quand on habite ailleurs : son bocage, pas le cottage anglais)
    expect(awayLook('maison')).toBe('normandie');
    expect(awayLook('camping')).toBe(null);
    expect(awayLook(undefined)).toBe(null);
    // (une famille par lieu, et toutes servent)
    expect(new Set(PLACE_IDS.map(awayLook)).size).toBe(PLACE_IDS.length);
    expect(new Set(PLACE_IDS.map(awayLook)).size).toBe(LOOKS.length);
    expect(PLACES.bretagne.sea).toBe(true);
  });

  it('les objets du jour du voyage : ceux du lieu (coquillages à la plage, sapin à la montagne), au moins quatre par lieu', () => {
    for (const look of LOOKS) {
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

  it('le décor du soin suit le lieu du voyage du jeu ; la balle et la longe le reçoivent aussi', async () => {
    const { careDecor } = await import('../src/ui/minigames/care3d.js');
    const a = { id: 'h9', species: 'horse', location: 'bretagne', needs: {} };
    const game = { profile: { home: 'maison', place: 'bretagne', animals: [a] }, day: 4, hour: 11, weather: 'clear', season: 'summer', entities: { get: () => null } };
    expect(careSetting(game, a, 'feed')).toBe('ailleurs');
    const d = careDecor(game, a, 'feed');
    expect(d.place).toBe('ailleurs');
    expect(d.look).toBe('plage');
    for (const k of d.kinds) expect(AWAY_LOOKS.plage.extras).toContain(k);
    // (la longe a besoin du rond : le décor du soin est le box, mais le lieu du voyage suit, pour le rond)
    const lunge = careDecor(game, a, 'lunge');
    expect(lunge.place).toBe('box');
    expect(lunge.look).toBe(null);
    expect(lunge.travel).toBe('plage');
    // (la chèvre emmenée dans les Alpes : sa balle se joue au pré, habillé des Alpes)
    const goat = { id: 'g9', species: 'goat', location: 'alpes', needs: {} };
    const g2 = { ...game, profile: { home: 'maison', place: 'alpes', animals: [goat] } };
    const play = careDecor(g2, goat, 'play');
    expect(play.place).toBe('etable');
    expect(play.travel).toBe('montagne');
    // (on habite en Bretagne et on part en Normandie : le bocage normand)
    const g3 = { ...game, profile: { home: 'bretagne', place: 'maison', animals: [a] } };
    a.location = 'maison';
    expect(careDecor(g3, a, 'feed').look).toBe('normandie');
    // (à la maison : pas de voyage)
    game.profile.place = 'maison';
    expect(careDecor(game, a, 'feed').look).toBe(null);
    expect(careDecor(game, a, 'feed').travel).toBe(null);
    // (un lieu inconnu : le décor dehors habituel)
    const g4 = { ...game, profile: { home: 'maison', place: 'camping', animals: [a] } };
    a.location = 'camping';
    expect(careDecor(g4, a, 'feed').look).toBe(null);
  }, 60000);
});

// ---------------------------------------------------------------- outils des scènes

/** Des rayons depuis la caméra du soin, sur toute l'image : la part où l'on voit d'abord le fond du voyage. */
function awayShare(sc) {
  const W = sc.decor.away.group;
  const v = sc.view;
  sc.scene.updateMatrixWorld(true);
  const objs = [];
  sc.scene.traverse((o) => {
    if (!(o.isMesh || o.isSprite) || o.userData?.sky) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    objs.push(o);
  });
  const rc = new THREE.Raycaster();
  rc.camera = sc.camera;
  rc.far = 60;
  let n = 0;
  let k = 0;
  for (let gy = 0.03; gy < 1; gy += 0.06) {
    for (let gx = 0.03; gx < 1; gx += 0.06) {
      const ray = sc.rayAt(v.x0 + gx * (v.x1 - v.x0), v.y0 + gy * (v.y1 - v.y0));
      rc.set(ray.origin.clone(), ray.direction.clone());
      // (on voit à travers le verre et le grillage du lapin : ses fils ne couvrent qu'un quart de l'image)
      const hit = rc.intersectObjects(objs, false).find((h) => !(h.object.material?.transparent && h.object.material.opacity < 0.5) && !(h.object.material?.alphaTest > 0 && h.object.material.metalness > 0.3));
      n++;
      let p = hit?.object ?? null;
      while (p && p !== W) p = p.parent;
      if (p) k++;
    }
  }
  return k / n;
}

/** La couleur la plus sombre de ses trois canaux (une couleur « blanche » : tous ses canaux hauts). */
const low = (c) => Math.min(c.r, c.g, c.b);
const high = (c) => Math.max(c.r, c.g, c.b);
/** Les InstancedMesh du fond, avec leurs places (monde). */
function instances(W) {
  const out = [];
  const m4 = new THREE.Matrix4();
  W.group.updateMatrixWorld(true);
  W.group.traverse((o) => {
    if (!o.isInstancedMesh) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m4);
      out.push({ o, p: new THREE.Vector3().setFromMatrixPosition(m4.premultiply(o.matrixWorld)) });
    }
  });
  return out;
}
/** Les matières du fond (et celles des pièces en instances). */
function materials(W) {
  const s = new Set();
  W.group.traverse((o) => o.material && s.add(o.material));
  return [...s];
}

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

  for (const look of LOOKS) {
    it(`${look} : le fond du lieu loin derrière l'animal, sans ombres, les arbres de la ferme cachés ; tout est rendu et libéré à la fermeture`, () => {
      const { sc } = farmStage({ species: 'cow', set: decorFor('cow', 'ailleurs', { amb, look, kinds: [], seed: 2 }) });
      const D = sc.decor;
      expect(D.place).toBe('ailleurs');
      expect(D.away?.look).toBe(look);
      // les arbres et collines de la ferme : cachés
      const far = [];
      D.group.traverse((o) => o.userData?.far && far.push(o));
      expect(far.length).toBeGreaterThan(0);
      for (const o of far) expect(o.visible).toBe(false);
      // le fond : quelques dizaines de pièces au plus (les arbres en instances), toutes derrière l'animal, sans ombres
      const W = D.away.group;
      let meshes = 0;
      const box = new THREE.Box3().setFromObject(sc.model.coatMesh ?? sc.holder);
      W.updateWorldMatrix(true, true);
      W.traverse((o) => {
        if (!o.isMesh && !o.isSprite) return;
        meshes++;
        const b = new THREE.Box3().setFromObject(o);
        expect(b.max.z, `${look} : ${o.type} derrière l'animal`).toBeLessThan(box.min.z - 1);
        if (o.isMesh) {
          expect(o.castShadow, `${look} : ${o.type} sans ombre portée`).toBe(false);
          expect(o.receiveShadow, `${look} : ${o.type} sans ombre reçue`).toBe(false);
        }
      });
      expect(meshes).toBeGreaterThan(3);
      expect(meshes).toBeLessThan(90);
      // (la construction du pays et les choses toutes proches : gardées hors de sa tête dans l'image)
      expect(D.away.landmarks.length).toBeGreaterThan(0);
      // le sol de la plage, du bush : du sable, de la terre rouge (sans herbe)
      const main = D.ground.find((m) => m.userData?.main);
      if (look === 'plage' || look === 'bush') {
        expect(main.map).not.toBe(null);
        const grass = [];
        D.group.traverse((o) => o.userData?.grass && grass.push(o));
        for (const o of grass) expect(o.visible).toBe(false);
      }
      // ça bouge un peu (l'écume, le voilier, la fumée, l'éolienne, le kangourou) sans erreur
      for (let i = 0; i < 20; i++) sc.update(1 / 30);
      // tout est libéré : formes, matières, textures (dont le sable posé sur le sol), pièces en instances
      const geos = new Set();
      // (sauf la forme des bouffées de fumée : celle, partagée, de three.js)
      W.traverse((o) => o.geometry && !o.isSprite && geos.add(o.geometry));
      const mats = materials(D.away);
      const texs = new Set();
      for (const m of mats) if (m.map) texs.add(m.map);
      if (look === 'plage' || look === 'bush') texs.add(main.map);
      const insts = [];
      W.traverse((o) => o.isInstancedMesh && insts.push(o));
      let freed = 0;
      for (const x of [...geos, ...mats, ...texs, ...insts]) x.addEventListener('dispose', () => freed++);
      sc.dispose();
      expect(W.parent).toBeNull();
      expect(freed).toBe(geos.size + mats.length + texs.size + insts.length);
      for (const o of far) expect(o.visible).toBe(true);
    });
  }

  it('la plage : le sol devient sable, puis redevient herbe ; la mer et l\'écume sont là ; tout ce qui est planté est sur le sable', () => {
    // (avec la vie du lieu, comme le jeu la donne : en gros plan sur la vache au râtelier, le sable proche est le long du
    // râtelier — rien ne s'y pose, jamais sur ce qu'on lui tend : la vie accrochée ou au loin est ce qu'on voit)
    const { sc, ctx } = farmStage({ species: 'cow', set: decorFor('cow', 'ailleurs', { amb, look: 'plage', kinds: ['coquillage', 'crabe', 'mouette'], life: ['vol', 'nichoir', 'fer'], seed: 5 }) });
    const D = sc.decor;
    const main = D.ground.find((m) => m.userData?.main);
    // (le décor de base est construit avant le fond : on compare avec un pré ordinaire)
    const { sc: sc2 } = farmStage({ species: 'cow', set: decorFor('cow', 'pre', { amb, kinds: [], seed: 5 }) });
    const grassMain = sc2.decor.ground.find((m) => m.userData?.main);
    expect(main.color.getHex()).not.toBe(grassMain.color.getHex());
    expect(main.map).not.toBe(null);
    let sea = null;
    D.away.group.traverse((o) => {
      if (o.userData?.sea) sea = o;
    });
    expect(sea).toBeTruthy();
    // (les pins, les dunes, les cabanes, le paravent : sur le sable, jamais dans l'eau)
    const shore = D.away.shore;
    expect(shore).toBeLessThan(0);
    const all = instances(D.away);
    expect(all.length).toBeGreaterThan(10);
    for (const { o, p } of all) expect(p.z, `${o.geometry.type} dans la mer`).toBeGreaterThan(shore + 0.5);
    for (const it of D.away.landmarks) {
      const b = new THREE.Box3().setFromObject(it.o);
      expect(b.min.z, 'cabane ou paravent dans la mer').toBeGreaterThan(shore + 0.5);
    }
    // (les objets du jour de la plage : posés)
    const game = farmFeed(ctx);
    run(ctx, game, sc, 3);
    expect(D.extras.placed.length).toBeGreaterThan(0);
    for (const k of D.extras.placed) expect(['coquillage', 'crabe', 'mouette', ...LIFE_KINDS]).toContain(k);
    game.destroy();
    const savedMap = main.map;
    sc.dispose();
    expect(main.map).not.toBe(savedMap);
    expect(main.color.getHex()).toBe(grassMain.color.getHex());
    sc2.dispose();
  });

  it('la nuit, l\'écume et la fumée du volcan s\'assombrissent avec le reste ; le jour, l\'écume est blanche', () => {
    const at = (hour, look) => farmStage({ species: 'cow', set: decorFor('cow', 'ailleurs', { amb: careAmbience({ hour, weather: 'clear', season: 'summer' }), look, kinds: [], seed: 2 }) }).sc;
    const foamOf = (sc) => {
      let f = null;
      sc.decor.away.group.traverse((o) => {
        if (o.userData?.foam) f = o;
      });
      return f;
    };
    const day = at(11, 'plage');
    expect(low(foamOf(day).material.color)).toBeGreaterThan(0.8);
    day.dispose();
    const night = at(23, 'plage');
    expect(high(foamOf(night).material.color)).toBeLessThan(0.3);
    night.dispose();
    const smoke = (sc) => {
      const out = [];
      sc.decor.away.group.traverse((o) => o.userData?.smoke && out.push(o));
      return out;
    };
    const vDay = at(11, 'volcan');
    expect(smoke(vDay).length).toBe(10);
    for (const s of smoke(vDay)) expect(high(s.material.color)).toBeGreaterThan(0.25);
    vDay.dispose();
    const vNight = at(23, 'volcan');
    for (const s of smoke(vNight)) expect(high(s.material.color)).toBeLessThan(0.1);
    vNight.dispose();
  });

  it('la neige et la saison : blanc quand il neige, ou l\'hiver en montagne ; un hiver sans neige ailleurs garde ses couleurs', () => {
    const snowCapHex = 0xf2f6fa;
    const scene = (hour, weather, season, look) => farmStage({ species: 'cow', set: decorFor('cow', 'ailleurs', { amb: careAmbience({ hour, weather, season }), look, kinds: [], seed: 2 }) }).sc;
    /** Les collines (demi-sphères larges, en instances) : leur matière. */
    const hillsOf = (sc) => {
      const out = [];
      sc.decor.away.group.traverse((o) => o.isInstancedMesh && o.geometry.parameters?.widthSegments === 16 && o.geometry.type === 'SphereGeometry' && out.push(o.material));
      return out;
    };
    const capped = (sc) => materials(sc.decor.away).some((m) => m.color?.getHex() === snowCapHex);
    // la Pampa en hiver, sans neige (sa météo d'hiver n'en a pas) : des collines et des toits de tous les jours
    const pampa = scene(11, 'clear', 'winter', 'pampa');
    expect(hillsOf(pampa).length).toBeGreaterThan(0);
    for (const m of hillsOf(pampa)) expect(low(m.color)).toBeLessThan(0.5);
    expect(capped(pampa)).toBe(false);
    pampa.dispose();
    for (const look of ['japon', 'cottage', 'haras']) {
      const sc = scene(11, 'rain', 'winter', look);
      expect(capped(sc), `${look} : toits blancs sans neige`).toBe(false);
      sc.dispose();
    }
    // les Alpes au printemps, sous la neige : collines blanches, toits et sapins enneigés
    const alps = scene(11, 'snow', 'spring', 'montagne');
    for (const m of hillsOf(alps)) expect(low(m.color)).toBeGreaterThan(0.55);
    expect(capped(alps)).toBe(true);
    alps.dispose();
    // les Alpes en hiver, même par temps clair : la neige reste en montagne
    const alpsW = scene(11, 'clear', 'winter', 'montagne');
    for (const m of hillsOf(alpsW)) expect(low(m.color)).toBeGreaterThan(0.55);
    alpsW.dispose();
    // les Rocheuses sous la neige au printemps : un chapeau blanc sur chaque pin
    const rock = scene(11, 'snow', 'spring', 'rocheuses');
    const caps = instances(rock.decor.away).filter(({ o }) => o.material.color?.getHex() === snowCapHex && o.geometry.type === 'IcosahedronGeometry');
    expect(caps.length).toBeGreaterThan(3);
    rock.dispose();
  });

  it('en qualité basse (téléphone) : moitié moins d\'arbres, moins de fumée, rien d\'animé au loin', () => {
    const count = (look) => {
      const sc = farmStage({ species: 'cow', set: decorFor('cow', 'ailleurs', { amb, look, kinds: [], seed: 2 }) }).sc;
      expect(sc.high).toBe(gfx.quality === 'high');
      const W = sc.decor.away;
      const trunks = instances(W).filter(({ o }) => o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.radiusTop === 0.1).length;
      let smoke = 0;
      let meshes = 0;
      W.group.traverse((o) => {
        if (o.userData?.smoke) smoke++;
        if (o.isMesh) meshes++;
      });
      // (le voilier : immobile en qualité basse)
      let boat = null;
      W.group.traverse((o) => {
        if (o.isGroup && o.children.some((c) => c.geometry?.type === 'ShapeGeometry')) boat = o;
      });
      const x0 = boat?.position.x;
      for (let i = 0; i < 30; i++) sc.update(1 / 30);
      const moved = boat ? boat.position.x !== x0 : false;
      sc.dispose();
      return { trunks, smoke, meshes, moved };
    };
    const hi = { montagne: count('montagne'), volcan: count('volcan'), bush: count('bush'), plage: count('plage') };
    const was = gfx.quality;
    gfx.quality = 'low';
    let lo;
    try {
      lo = { montagne: count('montagne'), volcan: count('volcan'), bush: count('bush'), plage: count('plage') };
    } finally {
      gfx.quality = was;
    }
    expect(lo.montagne.trunks).toBeLessThanOrEqual(Math.ceil(hi.montagne.trunks / 2));
    expect(lo.montagne.trunks).toBeGreaterThan(0);
    expect(hi.volcan.smoke).toBe(10);
    expect(lo.volcan.smoke).toBe(5);
    // (le kangourou : pas en qualité basse)
    expect(lo.bush.meshes).toBeLessThan(hi.bush.meshes);
    expect(hi.plage.moved).toBe(true);
    expect(lo.plage.moved).toBe(false);
  });

  it('la Normandie : la longère à colombages, les pommiers, les haies, des vaches au loin', () => {
    const sc = farmStage({ species: 'cow', set: decorFor('cow', 'ailleurs', { amb, look: 'normandie', kinds: [], seed: 2 }) }).sc;
    const W = sc.decor.away;
    const all = instances(W);
    // (les pommes rouges de l'été, les vaches : des boîtes blanches et brunes)
    expect(all.filter(({ o }) => o.material.color?.getHex() === 0xc8322a).length).toBeGreaterThan(5);
    expect(all.filter(({ o }) => o.geometry.type === 'BoxGeometry' && o.material.color?.getHex() === 0x6a4630).length).toBeGreaterThanOrEqual(4);
    // (la longère : ses murs portent la texture des colombages)
    const timbered = materials(W).some((m) => m.map?.image && W.landmarks.some((it) => {
      let found = false;
      it.o.traverse((o) => {
        if (o.material === m) found = true;
      });
      return found;
    }));
    expect(timbered).toBe(true);
    sc.dispose();
  });
});

/** Les « petits plus » du lieu qui peuvent s'ajouter aux objets du jour (setting.js LIFE_OF.ailleurs). */
const LIFE_KINDS = ['vol', 'nichoir', 'fer', 'papillons', 'rougegorge'];

describe('ce qu\'on voit depuis la caméra du soin, en voyage', () => {
  let C;
  let H;
  let P;
  beforeAll(async () => {
    await loadFarm();
    C = await import('../src/ui/minigames/care3d.js');
    const gltf = await loadRealHorseGltf();
    const horseReal = await import('../src/game/models/horseReal.js');
    horseReal.realHorseBase(gltf);
    H = {
      gltf, horseReal,
      t: (await import('../src/i18n.js')).t,
      stage: await import('../src/game/care/stage.js'),
      animal: await import('../src/sim/animal.js'),
      frame: await import('../src/ui/minigames/frame.js'),
      feed: (await import('../src/ui/minigames/feed3d.js')).ration3dGame,
      farmFeed: (await import('../src/ui/minigames/farm3d.js')).farmFeed3dGame,
      pets: (await import('../src/ui/minigames/pets3d.js')).PET_CARE3D_GAMES,
    };
    P = await import('./fixtures/petStage.js');
    await P.loadPets();
  }, 180000);
  afterEach(() => new Promise((resolve) => setImmediate(resolve)));

  const amb = careAmbience({ hour: 11, weather: 'clear', season: 'summer' });

  /** Le cheval dans son pré, toile de téléphone (w × h). */
  function horseStage(set, w = 390, h = 600) {
    const a = H.animal.createAnimal({ species: 'horse', breed: 'selle_francais', colorIndex: 0, ageDays: 900, seed: 77 });
    a.name = 'Honey';
    a.id = 'h-v';
    const model = H.horseReal.buildRealHorseModel(H.animal.stageLook(a), a.breed, H.gltf);
    const sc = new H.stage.CareStage({ a, renderer: H.stage.headlessRenderer(), model, set });
    const view = H.frame.fitView(w, h, 400, 360);
    sc.resize(w, h, view);
    sc.ready = true;
    return { a, sc, ctx: fakeCtxOf(a, H.t, { scene: sc, view }) };
  }
  /** La scène et le jeu « nourrir » de cette espèce. */
  function feedScene(species, look, w = 390, h = 600) {
    const set = C.decorFor(species, 'ailleurs', { amb, look, kinds: [], seed: 2 });
    if (species === 'horse') {
      const { sc, ctx } = horseStage(set, w, h);
      return { sc, ctx, game: H.feed(ctx) };
    }
    const { sc, ctx } = farmStage({ species, set, w, h });
    return { sc, ctx, game: H.farmFeed(ctx) };
  }

  it('cheval et vache, nourrir : le fond du lieu se voit (au moins 5 % de l\'image)', () => {
    for (const species of ['horse', 'cow']) {
      for (const look of ['plage', 'montagne', 'pampa', 'normandie']) {
        const { sc, ctx, game } = feedScene(species, look);
        run(ctx, game, sc, 2);
        expect(awayShare(sc), `${species} ${look}`).toBeGreaterThan(0.05);
        game.destroy();
        sc.dispose();
      }
    }
  }, 120000);

  it('chien, chat, lapin en voyage : ni la façade de la maison ni le clapier de la ferme ; le lieu se voit derrière la clôture basse', () => {
    for (const species of ['dog', 'cat', 'rabbit']) {
      for (const look of ['plage', 'montagne']) {
        const set = C.decorFor(species, 'ailleurs', { amb, look, kinds: [], seed: 2 });
        const { a, sc } = P.makePetStage({ species, breed: species === 'dog' ? 'labrador' : null, set });
        const D = sc.decor;
        expect(D.away?.look).toBe(look);
        // (pas de porte-fenêtre ni de mur de la maison, pas de niche ; le clapier et sa plaque restés à la ferme)
        D.group.traverse((o) => {
          expect(o.userData?.window, `${species} : la porte-fenêtre de la maison`).toBeFalsy();
        });
        let top = D.plate;
        while (top?.parent) top = top.parent;
        if (species === 'rabbit') expect(top).not.toBe(sc.scene);
        else expect(top).toBe(sc.scene);
        // (le décor dit où est le fond : derrière la clôture basse)
        expect(D.room.back).toBeLessThan(0);
        // (à la plage, la mer plus près d'un petit animal ; tout ce qui est planté reste sur le sable)
        if (look === 'plage') {
          for (const { o, p } of instances(D.away)) expect(p.z, `${species} : ${o.geometry.type} dans la mer`).toBeGreaterThan(D.away.shore + 0.5);
          for (const it of D.away.landmarks) expect(new THREE.Box3().setFromObject(it.o).min.z, `${species} : dans la mer`).toBeGreaterThan(D.away.shore + 0.5);
        }
        // ce qu'on voit en le caressant : le lieu, derrière la clôture basse — les sapins et les sommets (au moins 5 % de
        // l'image) ; à la plage, le sable et la mer au loin (une bande, la caméra est à sa hauteur)
        const ctx = P.ctxFor(a, sc);
        const game = H.pets[species].pet(ctx);
        P.run(ctx, game, sc, 2);
        expect(awayShare(sc), `${species} ${look}`).toBeGreaterThan(look === 'plage' ? 0.01 : 0.05);
        if (look === 'plage') expect(D.ground.find((m) => m.userData?.main).map).toBeTruthy();
        game.destroy?.();
        sc.dispose();
      }
    }
    // (un lieu inconnu : le jardin habituel, avec sa façade)
    const { sc } = P.makePetStage({ species: 'dog', breed: 'labrador', set: C.decorFor('dog', 'ailleurs', { amb, look: null, kinds: [], seed: 2 }) });
    expect(sc.decor.away).toBe(null);
    let win = false;
    sc.decor.group.traverse((o) => {
      if (o.userData?.window) win = true;
    });
    expect(win).toBe(true);
    sc.dispose();
  }, 120000);

  /** Le rectangle de o dans l'image touche-t-il le cercle de sa tête (même mesure que away.js, un peu de marge) ? */
  function behindHead(sc, o) {
    sc.scene.updateMatrixWorld(true);
    const hd = sc.live('head');
    const hc = sc.project(hd);
    const ab = new THREE.Box3().setFromObject(sc.model.coatMesh ?? sc.holder);
    const hr = sc.projectRadius(hd, 0.25 * Math.max(0.25, ab.max.y - ab.min.y)) + 10 - 6;
    const b = new THREE.Box3().setFromObject(o);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const x of [b.min.x, b.max.x]) {
      for (const y of [b.min.y, b.max.y]) {
        for (const z of [b.min.z, b.max.z]) {
          const q = sc.project(new THREE.Vector3(x, y, z));
          x0 = Math.min(x0, q.x);
          x1 = Math.max(x1, q.x);
          y0 = Math.min(y0, q.y);
          y1 = Math.max(y1, q.y);
        }
      }
    }
    return Math.hypot(Math.max(x0, Math.min(hc.x, x1)) - hc.x, Math.max(y0, Math.min(hc.y, y1)) - hc.y) < hr;
  }

  it('la construction du pays n\'est jamais juste derrière sa tête, au téléphone en portrait comme en paysage', () => {
    const sizes = [[390, 600], [900, 400], [640, 300]];
    for (const species of ['horse', 'cow']) {
      for (const look of LOOKS) {
        for (const [w, h] of sizes) {
          const { sc, ctx, game } = feedScene(species, look, w, h);
          run(ctx, game, sc, 1.5);
          for (const it of sc.decor.away.landmarks) expect(behindHead(sc, it.o), `${species} ${look} ${w}×${h}`).toBe(false);
          game.destroy();
          sc.dispose();
        }
      }
    }
  }, 240000);

  it('posée juste derrière sa tête, la construction glisse sur le côté dès que l\'image change', () => {
    for (const look of ['montagne', 'japon', 'haras']) {
      const { sc, ctx, game } = feedScene('horse', look);
      run(ctx, game, sc, 1.5);
      const it = sc.decor.away.landmarks[0];
      // (on la met sur la ligne de la caméra à sa tête, à sa profondeur)
      sc.scene.updateMatrixWorld(true);
      const hd = sc.live('head');
      const c = sc.camera.position;
      const z = (it.box.min.z + it.box.max.z) / 2;
      const x = c.x + ((hd.x - c.x) * (z - c.z)) / (hd.z - c.z);
      it.x0 = x - (it.box.min.x + it.box.max.x) / 2;
      it.shift = 0;
      it.o.position.x = it.x0;
      expect(behindHead(sc, it.o), look).toBe(true);
      // (la toile change un peu de forme : on regarde à nouveau)
      sc.resize(392, 600, H.frame.fitView(392, 600, 400, 360));
      sc.update(1 / 30);
      expect(it.shift, look).not.toBe(0);
      expect(behindHead(sc, it.o), look).toBe(false);
      game.destroy();
      sc.dispose();
    }
  }, 120000);
});

describe('la balle de la chèvre et la longe, en voyage', () => {
  let care3d;
  let goatPlay;
  let lunge3d;
  let H;
  beforeAll(async () => {
    await loadFarm();
    care3d = await import('../src/ui/minigames/care3d.js');
    goatPlay = await import('../src/ui/minigames/goatPlay3d.js');
    lunge3d = await import('../src/ui/minigames/lunge3d.js');
    const gltf = await loadRealHorseGltf();
    const horseReal = await import('../src/game/models/horseReal.js');
    horseReal.realHorseBase(gltf);
    H = {
      gltf, horseReal,
      t: (await import('../src/i18n.js')).t,
      stage: await import('../src/game/care/stage.js'),
      animal: await import('../src/sim/animal.js'),
      frame: await import('../src/ui/minigames/frame.js'),
    };
  }, 180000);
  afterEach(() => new Promise((resolve) => setImmediate(resolve)));

  /** Ce que careDecor donne au décor du soin, en voyage dans ce lieu (travel). */
  const dressOf = (amb, id, species, travel) => ({ amb, day: 4, id, species, seed: hashSeed(`4|${id}`) % 100000, look: null, travel });
  const setOf = (species, place, amb, id, travel) => care3d.decorFor(species, place, { amb, kinds: [], seed: 1, dress: dressOf(amb, id, species, travel) });

  it('la chèvre emmenée dans les Alpes : le pré de la balle a les sommets, les sapins, le chalet et les objets des Alpes', () => {
    const amb = careAmbience({ hour: 15, weather: 'clear', season: 'summer' });
    const { sc, ctx } = farmStage({ species: 'goat', set: setOf('goat', 'etable', amb, 'g1', 'montagne') });
    const barn = sc.decor;
    const game = goatPlay.goatPlay3dGame(ctx);
    const pre = sc.decor;
    expect(pre.kind).toBe('pre');
    expect(pre.away?.look).toBe('montagne');
    // (les arbres et collines de la ferme : cachés ; le fond des Alpes : derrière le terrain)
    pre.group.traverse((o) => {
      if (o.userData?.far) expect(o.visible).toBe(false);
    });
    expect(instances(pre.away).length).toBeGreaterThan(20);
    for (const k of pre.extrasPicked) expect(AWAY_LOOKS.montagne.extras).toContain(k);
    run(ctx, game, sc, 1.5);
    const W = pre.away.group;
    game.destroy();
    expect(sc.decor).toBe(barn);
    expect(W.parent).toBe(null);
    sc.dispose();
  }, 60000);

  for (const [look, amb] of [
    ['plage', careAmbience({ hour: 16, weather: 'clear', season: 'summer' })],
    ['montagne', careAmbience({ hour: 23, weather: 'snow', season: 'winter' })],
  ]) {
    it(`la longe à ${look} : le rond est entouré du lieu tout autour (la caméra en fait le tour), sans l'écurie ni les arbres de la ferme`, () => {
      const a = H.animal.createAnimal({ species: 'horse', breed: 'selle_francais', colorIndex: 0, ageDays: 900, seed: 77 });
      a.name = 'Honey';
      a.personality = 'calm';
      a.gear = { halter: { item: 'halter', color: 'red' } };
      const model = H.horseReal.buildRealHorseModel(H.animal.stageLook(a), a.breed, H.gltf);
      const sc = new H.stage.CareStage({ a, renderer: H.stage.headlessRenderer(), model, set: setOf('horse', 'box', amb, 'h1', look) });
      const view = H.frame.fitView(358, 520, 400, 360);
      const ctx = fakeCtxOf(a, H.t, { scene: sc, view });
      const stall = sc.decor;
      const game = lunge3d.lunge3dGame(ctx);
      sc.resize(358, 520, view);
      sc.ready = true;
      const pen = sc.decor;
      expect(pen.kind).toBe('roundPen');
      expect(pen.away?.look).toBe(look);
      const F = pen.dims.F;
      // (ce qui reste du rond : rien de visible loin de la clôture, sauf le fond du lieu et le ciel)
      for (const o of pen.group.children) {
        if (o === pen.away.group || o.isLight || !o.visible || o.userData?.sky || o.userData?.grass || !(o.isMesh || o.isGroup)) continue;
        if (o.isInstancedMesh) continue;
        expect(Math.hypot(o.position.x, o.position.z), `${o.type} de la ferme au loin`).toBeLessThan(F + 2.5);
      }
      // (les arbres du lieu, de tous les côtés du rond)
      const quads = new Set();
      for (const { o, p } of instances(pen.away)) {
        if (o.geometry.type !== 'CylinderGeometry') continue;
        quads.add(`${p.x > 0 ? '+' : '-'}${p.z > 0 ? '+' : '-'}`);
        if (pen.away.shore !== null) expect(p.z, 'arbre dans la mer').toBeGreaterThan(pen.away.shore + 0.5);
      }
      expect(quads.size).toBe(4);
      for (let k = 0; k < 30; k++) {
        ctx.time += 1 / 30;
        game.update(1 / 30);
        sc.update(1 / 30);
      }
      for (const k of pen.extrasPicked) expect(AWAY_LOOKS[look].extras).toContain(k);
      const W = pen.away.group;
      game.destroy();
      expect(sc.decor).toBe(stall);
      expect(W.parent).toBe(null);
      sc.dispose();
    }, 90000);
  }
});
