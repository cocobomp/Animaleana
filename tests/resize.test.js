import { describe, it, expect } from 'vitest';
import {
  resizeLimits, worldLimits, dragRect, addedStrips, validateResize, resizeCost, resizeCore, resizeStructure,
  capacityFor, coreResizeOpts, structureResizeOpts, migrateCoreSizes, growthCandidates, validateStableExtension,
  gateApron, localSize, CORE_VERSION, canResize, coreResidents,
} from '../src/sim/resize.js';
import {
  CORE_ITEMS, coreRect, coreSize, slotOf, footprintOf, capacityOf, refundOf, homeZone, build, assign, enclosureOf,
  validateCore, moveCore, followsCore, equipmentPos, corePos,
} from '../src/sim/construction.js';
import {
  ensureFacilities, boxCount, stableSlots, canExtendStable, extendStable, stableRect, tackRoomPos, buyUpgrade,
  petHousePos, PETHOUSE_SIZE, TACKROOM_SIZE,
} from '../src/sim/facilities.js';
import { createProfile, migrate } from '../src/sim/profile.js';
import { createAnimal } from '../src/sim/animal.js';
import { xpForLevel } from '../src/sim/progress.js';
import { buildingActions } from '../src/sim/buildings.js';
import { boxSlots, stableWidth } from '../src/game/models/stableInterior.js';

const manage = (money = 5000) => {
  const p = createProfile('A', 'manage');
  p.money = money;
  p.xp = xpForLevel(12);
  return p;
};
const flat = { heightAt: () => 0, isWater: () => false };
const pad = (layout = null) => coreRect(layout, 'paddock');
// Le paddock amené ici depuis loin (sa place actuelle est ailleurs) : alors rien n'est toléré.
const comingFromFar = (env, p) => validateCore('paddock', p.x, p.z, { ...env, core: { paddock: { x: p.x + 40, z: p.z + 40 } } }).ok;

describe('agrandir : tailles et poignées', () => {
  it('le paddock de départ fait au moins 22 × 26 m, la bergerie et le clapier sont plus grands qu\'avant', () => {
    expect(coreSize(null, 'paddock')).toEqual({ w: 22, d: 26 });
    const area = (s) => s.w * s.d;
    for (const id of ['pen', 'hutch']) expect(area(coreSize(null, id))).toBeGreaterThan(area(CORE_ITEMS[id].legacy));
    // Le nouveau paddock contient l'ancien : les chevaux qui y étaient y sont toujours.
    const n = pad();
    const o = CORE_ITEMS.paddock.legacy;
    expect(n.x - n.hw).toBeLessThanOrEqual(o.x - o.w / 2);
    expect(n.x + n.hw).toBeGreaterThanOrEqual(o.x + o.w / 2);
    expect(n.z - n.hd).toBeLessThanOrEqual(o.z - o.d / 2);
    expect(n.z + n.hd).toBeGreaterThanOrEqual(o.z + o.d / 2);
  });

  it('on tire un bord au mètre près, le bord d\'en face ne bouge pas, et on reste dans les limites', () => {
    const lim = worldLimits('paddock');
    const r = pad();
    const east = dragRect(r, 'e', r.x + r.hw + 2.4, 0, lim);
    expect(east.hw * 2).toBe(24);
    expect(east.x - east.hw).toBe(r.x - r.hw);
    const corner = dragRect(r, 'nw', r.x - r.hw - 1.6, r.z + r.hd + 3.2, lim);
    expect(corner).toMatchObject({ hw: 12, hd: 14.5 });
    expect(corner.x + corner.hw).toBe(r.x + r.hw);
    expect(dragRect(r, 'e', r.x - 100, 0, lim).hw * 2).toBe(lim.min[0]);
    expect(dragRect(r, 's', 0, r.z - 500, lim).hd * 2).toBe(lim.max[1]);
  });

  it('un enclos construit tourné : ses limites suivent la rotation', () => {
    expect(canResize('paddockLarge')).toBe(true);
    expect(canResize('barn')).toBe(false);
    expect(worldLimits('arena', 1).min).toEqual([...resizeLimits('arena').min].reverse());
    expect(localSize({ x: 0, z: 0, hw: 10, hd: 7 }, 1)).toEqual({ w: 14, d: 20 });
  });

  it('les bandes ajoutées sont seulement ce qui dépasse', () => {
    const old = { x: 0, z: 0, hw: 5, hd: 5 };
    expect(addedStrips(old, old)).toEqual([]);
    const s = addedStrips(old, { x: 1, z: 0, hw: 6, hd: 5 });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ dir: 'e', x: 6, hw: 1 });
    expect(addedStrips(old, { x: 0, z: 0, hw: 4, hd: 4 })).toEqual([]); // réduire n'ajoute rien
  });
});

describe('agrandir : où c\'est permis', () => {
  const opts = coreResizeOpts('paddock');
  it('dans l\'herbe libre, oui ; sur un bâtiment, une construction ou hors de la carte, non', () => {
    const r = pad();
    const bigger = dragRect(r, 'n', 0, r.z + r.hd + 4, worldLimits('paddock'));
    expect(validateResize(r, bigger, opts, flat).ok).toBe(true);
    const barn = { x: r.x, z: r.z + r.hd + 4, hw: 3, hd: 2 };
    expect(validateResize(r, bigger, opts, { ...flat, colliders: [barn] }).reason).toBe('overlap');
    const structures = [{ id: 'k', type: 'kennel', place: 'maison', x: r.x, z: r.z + r.hd + 3, rot: 0 }];
    expect(validateResize(r, bigger, opts, { ...flat, structures }).reason).toBe('overlap');
    const far = { x: 75, z: 70, hw: 18, hd: 15 };
    expect(validateResize({ x: 70, z: 70, hw: 10, hd: 10 }, far, opts, flat).reason).toBe('bounds');
  });

  it('il faut garder un passage, mais un voisin déjà collé ne bloque que son côté', () => {
    const r = pad();
    // Un mur juste au sud du paddock (comme l'écurie) : on peut quand même grandir vers le nord ou l'est.
    const wall = { x: r.x, z: r.z - r.hd - 0.6, hw: 6, hd: 0.2 };
    const north = dragRect(r, 'n', 0, r.z + r.hd + 3, worldLimits('paddock'));
    const east = dragRect(r, 'e', r.x + r.hw + 3, 0, worldLimits('paddock'));
    expect(validateResize(r, north, opts, { ...flat, colliders: [wall] }).ok).toBe(true);
    expect(validateResize(r, east, opts, { ...flat, colliders: [wall] }).ok).toBe(true);
    // Vers le sud : non (pas de passage).
    const south = dragRect(r, 's', 0, r.z - r.hd - 2, worldLimits('paddock'));
    expect(validateResize(r, south, opts, { ...flat, colliders: [wall] }).reason).toBe('overlap');
    // Un cabanon à 1 m du nouveau bord : trop serré.
    const shed = { x: r.x, z: r.z + r.hd + 3 + 1.5, hw: 1, hd: 0.5 };
    expect(validateResize(r, north, opts, { ...flat, colliders: [shed] }).reason).toBe('overlap');
    // Après avoir réduit côté sud, on peut revenir à la place d'origine (contre le mur), pas plus loin.
    const small = dragRect(r, 's', 0, r.z - r.hd + 4, worldLimits('paddock'));
    expect(validateResize(small, r, opts, { ...flat, colliders: [wall] }).ok).toBe(true);
    const further = dragRect(small, 's', 0, r.z - r.hd - 1, worldLimits('paddock'));
    expect(validateResize(small, further, opts, { ...flat, colliders: [wall] }).reason).toBe('overlap');
  });

  it('on n\'écrase pas une porte, et la porte du paddock (au milieu de son côté) doit rester libre', () => {
    const r = pad();
    const east = dragRect(r, 'e', r.x + r.hw + 3, 0, worldLimits('paddock'));
    const door = { x: r.x + r.hw + 2, z: r.z + 8, hw: 1.6, hd: 1.6 };
    expect(validateResize(r, east, opts, { ...flat, blocked: [door] }).reason).toBe('door');
    // Un équipement devant la nouvelle porte : non plus.
    const ap = gateApron(east, CORE_ITEMS.paddock.gate, 3);
    expect(validateResize(r, east, opts, { ...flat, equipment: [{ x: ap.x, z: ap.z }] }).reason).toBe('overlap');
  });

  it('trop petit, trop grand, eau et pente', () => {
    const r = pad();
    expect(validateResize(r, { ...r, hw: 5 }, opts, flat).reason).toBe('tooSmall');
    expect(validateResize(r, { ...r, hd: 30 }, opts, flat).reason).toBe('tooBig');
    const north = { ...r, z: r.z + 2, hd: r.hd + 2 };
    expect(validateResize(r, north, opts, { heightAt: () => 0, isWater: (x, z) => z > r.z + r.hd }).reason).toBe('water');
    expect(validateResize(r, north, opts, { heightAt: (x, z) => (z > r.z + r.hd ? 5 : 0) }).reason).toBe('slope');
  });

  it('un enclos construit ne rapetisse pas au point de ne plus loger ses habitants', () => {
    const p = manage();
    const s = build(p, 'paddockSmall', 'maison', 40, 0, 0).structure;
    for (let i = 0; i < 3; i++) {
      const a = createAnimal({ species: 'horse', location: 'maison' });
      p.animals.push(a);
      expect(assign(p, a, s).ok).toBe(true);
    }
    const f = footprintOf(s);
    const tiny = { ...f, hw: 4, hd: 4 };
    expect(validateResize(f, tiny, structureResizeOpts(p, s), flat).reason).toBe('crowded');
    expect(resizeStructure(p, s.id, tiny).reason).toBe('crowded');
  });
});

describe('agrandir : prix, places et enregistrement', () => {
  it('la surface ajoutée se paie, la surface rendue est remboursée à moitié, gratuit en bac à sable', () => {
    const p = manage(1000);
    const r = pad();
    const bigger = { ...r, x: r.x + 1, hw: r.hw + 1 }; // + 2 m × 26 m
    expect(resizeCost(p, 'paddock', r, bigger)).toMatchObject({ cost: 52 * 2, refund: 0, delta: 52 });
    expect(resizeCost(p, 'paddock', bigger, r)).toMatchObject({ cost: 0, refund: 52 });
    expect(resizeCost(createProfile('S'), 'paddock', r, bigger)).toMatchObject({ cost: 0, refund: 0 });
  });

  it('agrandir le paddock : enregistré par lieu, les équipements prévus restent dedans', () => {
    const p = manage(1000);
    const r = pad();
    const bigger = dragRect(r, 'ne', r.x + r.hw + 4, r.z + r.hd + 2, worldLimits('paddock'));
    const res = resizeCore(p, 'maison', 'paddock', bigger);
    expect(res.ok).toBe(true);
    expect(p.money).toBe(1000 - res.cost);
    expect(coreSize(p.coreLayout.maison, 'paddock')).toEqual({ w: 26, d: 28 });
    expect(coreRect(p.coreLayout.maison, 'paddock')).toEqual(bigger);
    // Un autre lieu garde sa propre taille.
    expect(coreSize(p.coreLayout.japon, 'paddock')).toEqual({ w: 22, d: 26 });
    // Le râtelier reste dans son coin (3 m des bords), même après une réduction.
    for (const rect of [bigger, { ...r, hw: 6, hd: 7 }]) {
      p.coreLayout.maison.paddock = { x: rect.x, z: rect.z, w: rect.hw * 2, d: rect.hd * 2 };
      const q = slotOf(p.coreLayout.maison, 'hayrack');
      expect(Math.abs(q.x - rect.x)).toBeLessThan(rect.hw);
      expect(Math.abs(q.z - rect.z)).toBeLessThan(rect.hd);
    }
    // Déplacer le paddock garde sa taille.
    expect(moveCore(p, 'maison', 'paddock', 40, 40).ok).toBe(true);
    expect(coreSize(p.coreLayout.maison, 'paddock')).toEqual({ w: 12, d: 14 });
    expect(validateCore('paddock', 40, 40, flat, coreSize(p.coreLayout.maison, 'paddock')).ok).toBe(true);
  });

  it('les places suivent la surface (et la démolition rembourse selon la taille)', () => {
    expect(capacityFor('paddock', 22, 26)).toBeGreaterThan(capacityFor('paddock', 14, 18));
    expect(capacityFor('hutch', 6, 5)).toBeGreaterThanOrEqual(4);
    const p = manage();
    const s = build(p, 'paddockLarge', 'maison', 40, -30, 1).structure;
    expect(capacityOf(s)).toBe(6);
    const f = footprintOf(s);
    const bigger = dragRect(f, 'e', f.x + f.hw + 8, 0, worldLimits('paddockLarge', 1));
    const money = p.money;
    const r = resizeStructure(p, s.id, bigger);
    expect(r.ok).toBe(true);
    expect(p.money).toBe(money - r.cost);
    expect(s.d).toBe(24); // tourné : la largeur du monde est sa profondeur
    expect(capacityOf(s)).toBe(9);
    expect(enclosureOf(s)).toMatchObject({ hw: 12, hd: 10, x: bigger.x });
    expect(homeZone(s).hw).toBeGreaterThan(8);
    expect(refundOf(s.type, { w: s.w, d: s.d })).toBeGreaterThan(refundOf(s.type));
  });
});

describe('agrandir : anciennes sauvegardes', () => {
  const old = (extra = {}) => {
    const p = createProfile('Vieux', 'manage');
    delete p.coreVersion;
    delete p.coreLayout;
    return { ...p, ...extra };
  };

  it('un paddock jamais déplacé prend la nouvelle taille (rien à écrire)', () => {
    const p = migrate(JSON.parse(JSON.stringify(old())));
    expect(p.coreVersion).toBe(CORE_VERSION);
    expect(coreSize(p.coreLayout.maison, 'paddock')).toEqual({ w: 22, d: 26 });
  });

  it('une construction gêne : il garde son ancienne taille à son ancienne place, et réessaiera au chargement', () => {
    const p = old({ structures: [{ id: 's1', type: 'kennel', place: 'maison', x: -25, z: 30, rot: 0 }] });
    migrateCoreSizes(p);
    const l = p.coreLayout.maison;
    expect(l.paddock).toMatchObject({ x: -16, z: 16, w: 14, d: 18, grow: true });
    expect(coreRect(l, 'pen')).toEqual(coreRect(null, 'pen')); // la bergerie, elle, grandit
  });

  it('une installation déplacée garde sa place (le décalage enregistré) et son ancienne taille', () => {
    const p = old({ coreLayout: { maison: { pen: { x: 50, z: 40 } }, japon: { paddock: { x: -40, z: 0 } } } });
    migrateCoreSizes(p);
    expect(p.coreLayout.maison.pen).toEqual({ x: 50, z: 40, w: 20, d: 14, grow: true });
    expect(p.coreLayout.japon.paddock).toMatchObject({ x: -40, z: 0, w: 14, d: 18 });
    // Une deuxième fois : rien ne change.
    const copy = JSON.stringify(p.coreLayout);
    migrateCoreSizes(p);
    expect(JSON.stringify(p.coreLayout)).toBe(copy);
  });

  it('au chargement, on essaie la nouvelle taille autour de l\'ancienne (dont la place par défaut)', () => {
    const layout = { paddock: { x: -16, z: 16, w: 14, d: 18, grow: true } };
    const c = growthCandidates(layout, 'paddock');
    expect(c.length).toBeGreaterThan(9);
    expect(c.some((r) => r.x === -16 && r.z === 20 && r.hw === 11 && r.hd === 13)).toBe(true);
    // Chaque candidat contient l'ancien paddock.
    const o = coreRect(layout, 'paddock');
    for (const r of c) {
      expect(r.x - r.hw).toBeLessThanOrEqual(o.x - o.hw + 1e-6);
      expect(r.z + r.hd).toBeGreaterThanOrEqual(o.z + o.hd - 1e-6);
    }
  });
});

describe('agrandir : depuis les menus', () => {
  it('le paddock, la bergerie et le clapier proposent « Agrandir » ; la niche non ; l\'écurie « Agrandir l\'écurie »', () => {
    const ctx = { hour: 10, season: 'summer', count: { horse: 1, livestock: 1, dog: 1, rabbit: 1, paddockDroppings: 0, penDroppings: 0 } };
    const ids = (kind, c = ctx) => buildingActions(kind, c).map((a) => a.id);
    for (const kind of ['paddock', 'pen', 'hutch']) expect(ids(kind)).toContain('resizeCore');
    expect(ids('kennel')).not.toContain('resizeCore');
    expect(ids('stable')).toContain('extendStable');
    // Une construction : seulement les enclos.
    const con = { hour: 10, count: { residents: 0, droppings: 0, horse: 0 } };
    expect(ids('con_enclosure', { ...con, resizable: true })).toContain('conResize');
    expect(ids('con_building', { ...con, resizable: false })).not.toContain('conResize');
  });

  it('les box de l\'écurie rallongée : les 8 premiers gardent leur rôle, les nouveaux aux deux bouts', () => {
    const a = boxSlots(0);
    const b = boxSlots(1);
    const c = boxSlots(2);
    expect([a.length, b.length, c.length]).toEqual([8, 12, 16]);
    // Même rangée pour les 8 premiers (et toujours la même place par rapport à l'entrée, au milieu).
    expect(b.slice(0, 8)).toEqual(a);
    expect(c.slice(0, 12)).toEqual(b);
    // Pas deux box au même endroit, et tous dans le bâtiment.
    const w = stableWidth(2);
    expect(new Set(c.map((s) => `${s.cx}|${s.row}`)).size).toBe(16);
    for (const s of c) expect(Math.abs(s.cx)).toBeLessThan(w / 2);
  });
});

describe('rallonger l\'écurie', () => {
  it('8 → 12 → 16 box, payant, la sellerie recule', () => {
    const p = manage(3000);
    const f = ensureFacilities(p);
    expect(stableSlots(f)).toBe(8);
    expect(boxCount(f)).toBe(4);
    expect(validateStableExtension(p, {}).ok).toBe(true);
    const r = extendStable(p);
    expect(r).toMatchObject({ ok: true, boxes: 12 });
    expect(p.money).toBe(2100);
    expect(stableSlots(f)).toBe(12);
    expect(boxCount(f)).toBe(8);
    expect(buyUpgrade(p, 'stable', 'boxes1').ok).toBe(true);
    expect(boxCount(f)).toBe(10);
    expect(extendStable(p).boxes).toBe(16);
    expect(canExtendStable(p).reason).toBe('max');
    // Le bout nord ne bouge pas (contre le paddock), le bâtiment s'allonge vers le sud.
    const a = stableRect(0);
    const b = stableRect(2);
    expect(a.z + a.hd).toBe(b.z + b.hd);
    expect(b.hd * 2).toBeCloseTo(16 + 12.8);
    expect(tackRoomPos(2).z).toBeLessThan(b.z - b.hd - 3);
  });

  it('niveau, argent et place libre', () => {
    const p = createProfile('B', 'manage');
    p.money = 5000;
    expect(canExtendStable(p).reason).toBe('level');
    p.xp = xpForLevel(12);
    p.money = 10;
    expect(canExtendStable(p).reason).toBe('money');
    p.money = 5000;
    const t = tackRoomPos(1);
    const structures = [{ id: 'x', type: 'kennel', place: 'maison', x: t.x, z: t.z, rot: 0 }];
    expect(validateStableExtension(p, { structures }).reason).toBe('overlap');
    // La nouvelle place de la maison des animaux, et le passage devant la façade, doivent aussi être libres.
    const ph = petHousePos(1);
    expect(validateStableExtension(p, { structures: [{ id: 'y', type: 'kennel', place: 'maison', x: ph.x, z: ph.z, rot: 0 }] }).reason).toBe('overlap');
    const s = stableRect(1);
    const kennelFront = { id: 'z', type: 'kennel', place: 'maison', x: s.x + s.hw + 1.2, z: s.z - s.hd + 2, rot: 0 };
    expect(validateStableExtension(p, { structures: [kennelFront] }).reason).toBe('overlap');
  });

  it('écurie rallongée : la maison des animaux recule avec la sellerie, on passe toujours le long de la façade', () => {
    for (const ext of [0, 1, 2]) {
      const s = stableRect(ext);
      const ph = petHousePos(ext);
      const tk = tackRoomPos(ext);
      // Même rangée que la sellerie, porte côté cour.
      expect(ph.z).toBe(tk.z);
      expect(ph.door.z).toBeGreaterThan(ph.z + PETHOUSE_SIZE.hd);
      // Pas à côté de la façade de l'écurie (sinon un couloir de 0,6 m), ou alors avec 2 m de passage.
      const besideFacade = ph.z + PETHOUSE_SIZE.hd > s.z - s.hd;
      if (besideFacade) expect(ph.x - PETHOUSE_SIZE.hw - (s.x + s.hw)).toBeGreaterThanOrEqual(2);
      // Allée entre la sellerie et la maison des animaux.
      expect(ph.x - PETHOUSE_SIZE.hw - (tk.x + TACKROOM_SIZE.hw)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('agrandir : prix juste, habitants et équipements', () => {
  it('réduire une installation sous sa taille de départ (offerte) ne rapporte rien ; y revenir ne coûte rien', () => {
    const p = manage(500);
    const r = pad(); // 22 × 26 m, offert
    const small = { ...r, hw: 6, hd: 7 }; // 12 × 14 m
    expect(resizeCost(p, 'paddock', r, small)).toMatchObject({ cost: 0, refund: 0 });
    expect(resizeCost(p, 'paddock', small, r)).toMatchObject({ cost: 0, refund: 0 });
    // Agrandi de 88 m² (176 pièces), puis réduit au minimum : on récupère la moitié de ce qu'on a payé.
    const big = { ...r, z: r.z + 1, hd: r.hd + 2 };
    expect(resizeCost(p, 'paddock', r, big).cost).toBe(176);
    expect(resizeCost(p, 'paddock', big, small).refund).toBe(88);
    // Agrandir, réduire, revenir : on ne gagne jamais d'argent.
    for (const rect of [big, small, r, small, big, r]) resizeCore(p, 'maison', 'paddock', rect);
    expect(p.money).toBeLessThan(500);
    // La bergerie et le clapier : pareil.
    const pen = coreRect(null, 'pen');
    expect(resizeCost(p, 'pen', pen, { ...pen, hw: 6, hd: 4 }).refund).toBe(0);
    const hu = coreRect(null, 'hutch');
    expect(resizeCost(p, 'hutch', hu, { ...hu, hw: 2, hd: 2 }).refund).toBe(0);
    // Un enclos construit a été payé : le réduire rembourse toujours la moitié.
    const s = build(manage(), 'paddockLarge', 'maison', 40, -30, 0).structure;
    const f = footprintOf(s);
    expect(resizeCost(p, 'paddockLarge', f, { ...f, hw: f.hw - 1 }).refund).toBeGreaterThan(0);
  });

  it('une installation de base ne se réduit pas sous le nombre d\'animaux qui y vivent', () => {
    const p = manage();
    for (let i = 0; i < 4; i++) p.animals.push(createAnimal({ species: 'horse', ageDays: 80, location: 'maison' }));
    expect(coreResidents(p, 'maison', 'paddock')).toBe(4);
    const r = pad();
    const tiny = { ...r, hw: 6, hd: 7 }; // 12 × 14 m : 2 places
    expect(capacityFor('paddock', 12, 14)).toBeLessThan(4);
    expect(validateResize(r, tiny, coreResizeOpts('paddock', 4), flat).reason).toBe('crowded');
    expect(validateResize(r, tiny, coreResizeOpts('paddock', 2), flat).ok).toBe(true);
    // Déjà trop plein : il peut quand même grandir.
    expect(validateResize(tiny, { ...tiny, x: tiny.x + 2, hw: 8 }, coreResizeOpts('paddock', 9), flat).ok).toBe(true);
    // Un cheval logé dans une construction, ou en voyage, ne compte pas ; le troupeau au pré non plus.
    p.animals[0].homeId = 'abc';
    p.animals[1].location = 'japon';
    expect(coreResidents(p, 'maison', 'paddock')).toBe(2);
    p.animals.push({ ...createAnimal({ species: 'sheep', ageDays: 80, location: 'maison' }), zone: 'field' });
    p.animals.push(createAnimal({ species: 'goat', ageDays: 80, location: 'maison' }));
    p.animals.push(createAnimal({ species: 'rabbit', ageDays: 80, location: 'maison' }));
    expect(coreResidents(p, 'maison', 'pen')).toBe(1);
    expect(coreResidents(p, 'maison', 'hutch')).toBe(1);
  });

  it('déplacer le paddock d\'un mètre : un voisin déjà proche (écurie, entrée du concours) ne bloque que si l\'on s\'en rapproche', () => {
    const env = {
      ...flat,
      colliders: [{ x: -22, z: 6, hw: 5, hd: 0.12, room: 'stable' }], // mur nord de l'écurie, à 1 m du paddock
      blocked: [{ x: -29.8, z: 14, hw: 1.6, hd: 1.6, kind: 'showground' }], // devant l'entrée du terrain de concours
    };
    const p = corePos(null, 'paddock');
    expect(validateCore('paddock', p.x, p.z, env).ok).toBe(true);
    expect(validateCore('paddock', p.x + 1, p.z, env).ok).toBe(true); // on s'éloigne du concours
    expect(validateCore('paddock', p.x, p.z + 1, env).ok).toBe(true); // et de l'écurie
    expect(validateCore('paddock', p.x - 1, p.z, env).reason).toBe('core'); // plus près de l'entrée du concours
    expect(validateCore('paddock', p.x, p.z - 1, env).reason).toBe('overlap'); // collé à l'écurie
    // Amené ici depuis loin : la règle habituelle (2,5 m de passage partout).
    expect(comingFromFar(env, p)).toBe(false);
  });

  it('les équipements rangés dans un enclos le suivent : ils ne bloquent pas son déplacement', () => {
    const layout = {};
    const feeder = { type: 'penFeeder' }; // à son emplacement prévu, dans la bergerie
    const brush = { type: 'cowBrush', pos: [10, 33] }; // posé par le joueur dans la bergerie
    const other = { type: 'petFeeder', pos: [40, 40] }; // ailleurs
    expect(followsCore(layout, feeder, 'pen')).toBe(true);
    expect(followsCore(layout, brush, 'pen')).toBe(true);
    expect(followsCore(layout, other, 'pen')).toBe(false);
    expect(followsCore(layout, feeder, 'paddock')).toBe(false);
    const col = (eq) => {
      const q = equipmentPos(layout, eq);
      return { x: q.x, z: q.z, hw: 0.5, hd: 0.4, equip: true };
    };
    const all = [feeder, brush, other];
    const p = corePos(layout, 'pen');
    // Comptées comme obstacles, ses propres mangeoires l'empêchaient de bouger d'un mètre.
    expect(validateCore('pen', p.x + 1, p.z, { ...flat, colliders: all.map(col) }).ok).toBe(false);
    const env = { ...flat, colliders: all.filter((eq) => !followsCore(layout, eq, 'pen')).map(col) };
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(validateCore('pen', p.x + dx, p.z + dz, env).ok).toBe(true);
  });
});
