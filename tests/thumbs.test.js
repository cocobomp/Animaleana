// Vignettes 3D : la logique pure du moteur (src/game/thumbs.js) — clés de cache, taille des images,
// file d'attente, rythme, cache LRU, cadrage automatique de la caméra, une image pour plusieurs tailles,
// images d'animation « calmes ».
import { describe, it, expect } from 'vitest';
import {
  thumbKey, outputSize, viewBasis, boxCorners, fitView, ThumbQueue, Pacer, ThumbCache,
  covers, bestCover, largestCovering, calmFrame, aboveGround, scaleAbout, Thumbs,
} from '../src/game/thumbs.js';

describe('vignettes : clés de cache', () => {
  it('ne dépend pas de l’ordre des propriétés', () => {
    expect(thumbKey({ kind: 'gear', id: 'saddle', color: 'brown', size: 'pony', w: 80, h: 64 }))
      .toBe(thumbKey({ h: 64, size: 'pony', w: 80, color: 'brown', id: 'saddle', kind: 'gear' }));
  });

  it('change avec la couleur, la taille, la robe ou l’âge', () => {
    const base = { kind: 'gear', id: 'saddle', color: 'brown', size: 'horse', w: 80, h: 64 };
    expect(thumbKey(base)).not.toBe(thumbKey({ ...base, color: 'black' }));
    expect(thumbKey(base)).not.toBe(thumbKey({ ...base, size: 'pony' }));
    expect(thumbKey(base)).not.toBe(thumbKey({ ...base, w: 180 }));
    const a = { kind: 'animal', species: 'horse', breed: 'frison', colorIndex: 0, sex: 'f', stage: 'adult' };
    expect(thumbKey(a)).not.toBe(thumbKey({ ...a, colorIndex: 1 }));
    expect(thumbKey(a)).not.toBe(thumbKey({ ...a, stage: 'baby' }));
    expect(thumbKey(a)).not.toBe(thumbKey({ ...a, sex: 'm' }));
  });

  it('commence par le genre et ignore les valeurs vides et les objets', () => {
    const k = thumbKey({ kind: 'structure', type: 'barn', size: undefined, color: null, label: '', look: { coat: 1 }, fn: () => 1 });
    expect(k).toBe('structure:type=barn');
    expect(thumbKey({ kind: 'animal', colorIndex: 0 })).toBe('animal:colorIndex=0'); // 0 n'est pas vide
    expect(thumbKey({ kind: 'x', pos: [1, 2] })).toBe('x:pos=1,2');
  });

  it('distingue des genres différents avec les mêmes réglages', () => {
    expect(thumbKey({ kind: 'structure', type: 'kennel' })).not.toBe(thumbKey({ kind: 'equipment', type: 'kennel' }));
  });
});

describe('vignettes : taille des images', () => {
  it('fait 2× la taille affichée', () => {
    expect(outputSize(80, 64)).toEqual([160, 128]);
    expect(outputSize(96, 72)).toEqual([192, 144]);
  });

  it('plafonne le plus grand côté en gardant les proportions', () => {
    const [w, h] = outputSize(360, 250, { max: 512 });
    expect(w).toBe(512);
    expect(Math.abs(w / h - 360 / 250)).toBeLessThan(0.02);
  });

  it('ne descend jamais sous le minimum', () => {
    expect(outputSize(1, 1)).toEqual([16, 16]);
  });
});

describe('vignettes : file d’attente', () => {
  it('donne d’abord la plus prioritaire, puis dans l’ordre des demandes', () => {
    const q = new ThumbQueue();
    q.push('a', 1, 2);
    q.push('b', 2, 2);
    q.push('c', 3, 3);
    q.push('d', 4, 1);
    expect([q.next().key, q.next().key, q.next().key, q.next().key]).toEqual(['c', 'a', 'b', 'd']);
    expect(q.next()).toBeNull();
  });

  it('ne garde pas de doublon et met à jour la priorité', () => {
    const q = new ThumbQueue();
    q.push('a', 'x', 2);
    q.push('b', 'y', 2);
    q.push('a', undefined, 2);
    expect(q.size).toBe(2);
    expect(q.next().key).toBe('a'); // même priorité : garde sa place
    q.push('c', 'z', 2);
    q.push('b', undefined, 0); // sortie de l'écran : passe après
    expect(q.next().key).toBe('c');
    expect(q.next()).toMatchObject({ key: 'b', data: 'y', priority: 0 });
  });

  it('jette les demandes que plus personne n’attend', () => {
    const q = new ThumbQueue();
    q.push('a', 1, 2);
    q.push('b', 2, 2);
    q.push('c', 3, 2);
    const wanted = new Set(['c']);
    expect(q.next((j) => wanted.has(j.key)).key).toBe('c');
    expect(q.size).toBe(0);
  });

  it('remet en fin de file une demande dont la priorité change', () => {
    const q = new ThumbQueue();
    q.push('a', 1, 2);
    q.push('b', 2, 1);
    q.push('a', 1, 1);
    expect(q.next().key).toBe('b');
    expect(q.next().key).toBe('a');
  });
});

describe('vignettes : rythme (le jeu ne saccade pas)', () => {
  it('attend au moins le temps de l’étape précédente', () => {
    const p = new Pacer({ rest: 1 });
    expect(p.ready(0)).toBe(true);
    p.done(1000, 12);
    expect(p.ready(1005)).toBe(false);
    expect(p.wait(1005)).toBeCloseTo(7);
    expect(p.ready(1012)).toBe(true);
  });

  it('borne l’attente (une étape très longue ne bloque pas tout)', () => {
    const p = new Pacer({ rest: 1, max: 300 });
    p.done(0, 5000);
    expect(p.ready(301)).toBe(true);
  });

  it('respecte une attente minimale', () => {
    const p = new Pacer({ rest: 1, min: 20 });
    p.done(0, 1);
    expect(p.ready(10)).toBe(false);
    expect(p.ready(20)).toBe(true);
  });
});

describe('vignettes : cache', () => {
  it('oublie la plus ancienne au-delà du maximum et prévient (pour libérer l’image)', () => {
    const gone = [];
    const c = new ThumbCache(2, (v, k) => gone.push(k));
    c.set('a', 'A', 10);
    c.set('b', 'B', 20);
    expect(c.get('a')).toBe('A'); // a devient la plus récente
    c.set('c', 'C', 30);
    expect(gone).toEqual(['b']);
    expect(c.has('a') && c.has('c')).toBe(true);
    expect(c.bytes).toBe(40);
  });

  it('remplacer une image libère l’ancienne', () => {
    const gone = [];
    const c = new ThumbCache(5, (v) => gone.push(v));
    c.set('a', 'A1', 5);
    c.set('a', 'A2', 7);
    expect(gone).toEqual(['A1']);
    expect(c.get('a')).toBe('A2');
    expect(c.bytes).toBe(7);
    c.clear();
    expect(c.size).toBe(0);
    expect(c.bytes).toBe(0);
  });

  it('renvoie null pour une image absente', () => {
    expect(new ThumbCache().get('x')).toBeNull();
  });
});

/** Projette un point sur l'image (-1 à 1) pour une caméra placée par fitView. */
function project(p, fit, fov, aspect, dir) {
  const { d, r, u } = viewBasis(dir);
  const v = [p[0] - fit.position[0], p[1] - fit.position[1], p[2] - fit.position[2]];
  const depth = -(v[0] * d[0] + v[1] * d[1] + v[2] * d[2]);
  const tv = Math.tan((fov * Math.PI) / 360);
  return {
    x: (v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / depth / (tv * aspect),
    y: (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / depth / tv,
    depth,
  };
}

describe('vignettes : cadrage automatique', () => {
  const cases = [
    ['une selle (petite, de trois quarts)', [-0.25, 0.4, -0.3], [0.25, 0.95, 0.3], [1, 0.6, 0.9], 4 / 3],
    ['un ranch (très large, vu d’en haut)', [-15, 0, -12], [15, 6, 12], [1, 1.05, 1.25], 4 / 3],
    ['un van attelé (long, de côté)', [-1.1, 0, -6], [1.1, 2.6, 2.5], [1, 0.5, 0.42], 1.25],
    ['un chat (carré)', [-0.12, 0, -0.3], [0.12, 0.35, 0.3], [1, 0.5, 0.95], 1],
  ];
  for (const [name, min, max, dir, aspect] of cases) {
    it(`tout tient dans l’image, centré, avec la marge : ${name}`, () => {
      const fov = 30;
      const pad = 1.1;
      const corners = boxCorners(min, max);
      const fit = fitView(corners, { dir, fov, aspect, pad });
      const pts = corners.map((p) => project(p, fit, fov, aspect, dir));
      for (const q of pts) {
        expect(q.depth).toBeGreaterThan(fit.near);
        expect(q.depth).toBeLessThan(fit.far);
        expect(Math.abs(q.x)).toBeLessThanOrEqual(1 / pad + 1e-3);
        expect(Math.abs(q.y)).toBeLessThanOrEqual(1 / pad + 1e-3);
      }
      const xs = pts.map((q) => q.x);
      const ys = pts.map((q) => q.y);
      // Centré (à 3 % près) et serré : il touche la marge en largeur ou en hauteur.
      expect(Math.abs(Math.min(...xs) + Math.max(...xs))).toBeLessThan(0.06);
      expect(Math.abs(Math.min(...ys) + Math.max(...ys))).toBeLessThan(0.06);
      expect(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))).toBeGreaterThan(2 / pad - 0.08);
    });
  }

  it('regarde depuis la direction demandée', () => {
    const fit = fitView(boxCorners([-1, -1, -1], [1, 1, 1]), { dir: [0, 0, 1], fov: 30, aspect: 1 });
    expect(fit.position[0]).toBeCloseTo(0);
    expect(fit.position[1]).toBeCloseTo(0);
    expect(fit.position[2]).toBeGreaterThan(1);
  });

  it('vue de dessus : un repère valable (pas de division par zéro)', () => {
    const b = viewBasis([0, 1, 0]);
    expect(b.up).toEqual([0, 0, -1]);
    expect(Number.isFinite(b.r[0] + b.u[2])).toBe(true);
    const fit = fitView(boxCorners([-1, 0, -1], [1, 0.2, 1]), { dir: [0, 1, 0] });
    expect(fit.position[1]).toBeGreaterThan(1);
    expect(fit.distance).toBeGreaterThan(0);
  });

  it('un objet plus grand est vu de plus loin', () => {
    const small = fitView(boxCorners([-0.5, 0, -0.5], [0.5, 1, 0.5]), { dir: [1, 0.6, 1] });
    const big = fitView(boxCorners([-5, 0, -5], [5, 10, 5]), { dir: [1, 0.6, 1] });
    expect(big.distance).toBeCloseTo(small.distance * 10, 3);
  });
});

describe('vignettes : une seule image pour plusieurs tailles du même objet', () => {
  it('une image plus grande et de même forme couvre une vue plus petite', () => {
    expect(covers([264, 198], [192, 144])).toBe(true); // aperçu de l'animalerie → fiche « Ton futur compagnon »
    expect(covers([720, 500], [176, 132])).toBe(true); // grande image de la fiche → carte du rayon (36:25 ≈ 4:3)
    expect(covers([720, 500], [152, 114])).toBe(true); // → petit aperçu à côté des couleurs
  });

  it('pas une image trop petite, ni d’une autre forme', () => {
    expect(covers([192, 144], [264, 198])).toBe(false);
    expect(covers([256, 128], [160, 160])).toBe(false); // 2:1 contre carré
    expect(covers([160, 128], [160, 128])).toBe(true); // la même
    expect(covers([150, 120], [160, 128])).toBe(true); // à 10 % près
    expect(covers([0, 0], [10, 10])).toBe(false);
  });

  it('prend la plus petite image qui suffit, et la plus grande demande à fabriquer', () => {
    const imgs = [{ id: 'a', size: [720, 500] }, { id: 'b', size: [240, 180] }, { id: 'c', size: [100, 75] }];
    expect(bestCover(imgs, [176, 132]).id).toBe('b');
    expect(bestCover(imgs, [800, 600])).toBe(null);
    const asks = [{ id: 'mini', size: [152, 114] }, { id: 'big', size: [720, 500] }, { id: 'carre', size: [200, 200] }];
    expect(largestCovering(asks, [176, 132]).id).toBe('big');
    expect(largestCovering(asks, [900, 700])).toBe(null);
  });

  it('le moteur fabrique une fois et sert toutes les tailles (et rend l’image la plus petite qui suffit)', async () => {
    const th = new Thumbs(null);
    expect(th.enabled).toBe(false); // (pas de WebGL dans les tests)
    th.enabled = true;
    const made = [];
    th.run = async (key, spec) => {
      made.push(key);
      const [W, H] = outputSize(spec.w, spec.h);
      th.store(key, thumbKey({ ...spec, w: undefined, h: undefined }), `blob:${key}`, 100, [W, H]);
      return `blob:${key}`;
    };
    const spec = { kind: 'animal', species: 'cat', breed: 'persan', colorIndex: 0, sex: 'f', stage: 'young' };
    const [small, big] = await Promise.all([th.want(spec, { w: 96, h: 72, priority: 3 }), th.want(spec, { w: 132, h: 99, priority: 3 })]);
    expect(made).toHaveLength(1);
    expect(made[0]).toContain('w=132');
    expect(small).toBe(big);
    // Déjà prête : une vue plus petite la reprend sans rien fabriquer.
    expect(th.get(spec, 84, 63)).toBe(big);
    expect(await th.want(spec, { w: 60, h: 45 })).toBe(big);
    expect(made).toHaveLength(1);
    // Une autre robe : une autre image.
    await th.want({ ...spec, colorIndex: 1 }, { w: 96, h: 72 });
    expect(made).toHaveLength(2);
    clearTimeout(th.idleTimer);
    clearTimeout(th.longIdleTimer);
  });

  it('une image sortie du cache ne sert plus aux autres tailles', () => {
    const th = new Thumbs(null);
    th.cache.max = 1;
    const spec = { kind: 'gear', id: 'saddle', color: 'brown', size: 'horse' };
    th.store(thumbKey({ ...spec, w: 360, h: 250 }), thumbKey(spec), 'blob:a', 10, [720, 500]);
    expect(th.get(spec, 88, 66)).toBe('blob:a');
    th.store('autre', 'autre-famille', 'blob:b', 10, [100, 100]);
    expect(th.get(spec, 88, 66)).toBe(null);
    expect(th.live.has('blob:a')).toBe(false);
    expect(th.family.has(thumbKey(spec))).toBe(false);
  });
});

describe('vignettes : rien sur une image en retard', () => {
  it('une image à l’heure est calme, une image en retard ne l’est pas', () => {
    expect(calmFrame(16.7, 16.7)).toBe(true);
    expect(calmFrame(33, 16.7)).toBe(true); // (une image sautée de temps en temps : toléré)
    expect(calmFrame(80, 16.7)).toBe(false);
  });

  it('s’adapte à un appareil lent (sinon on n’avancerait jamais)', () => {
    expect(calmFrame(80, 60)).toBe(true);
    expect(calmFrame(200, 60)).toBe(false);
  });
});

describe('vignettes : cadre au-dessus du sol, cadre « grandi »', () => {
  it('remonte une boîte qui passe sous le sol, sans changer sa taille', () => {
    const b = aboveGround([-0.35, -0.3, -0.35], [0.35, 0.4, 0.35], 0);
    expect(b.min[1]).toBeCloseTo(0);
    expect(b.max[1]).toBeCloseTo(0.7);
    expect(b.min[0]).toBe(-0.35);
    expect(aboveGround([0, 0.2, 0], [1, 1, 1], 0).min[1]).toBe(0.2); // déjà au-dessus : inchangée
  });

  it('agrandit des points autour d’une origine (le poney paraît plus petit dans le même cadre)', () => {
    const pts = scaleAbout([[1, 1, 0], [-1, 0, 2]], 2, [0, 0, 0]);
    expect(pts).toEqual([[2, 2, 0], [-2, 0, 4]]);
    const same = [[1, 2, 3]];
    expect(scaleAbout(same, 1, [0, 0, 0])).toBe(same);
  });
});
