// La lumière de l'heure et la météo du jeu dans le décor du soin (src/game/care/setting.js : careAmbience ;
// src/game/care/ambience.js : applyAmbience), sur une vraie scène sans navigateur.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { careAmbience, careTime, gameAmbience } from '../src/game/care/setting.js';
import { loadFarm, farmStage } from './fixtures/farmStage.js';

describe('l\'ambiance selon l\'heure et la météo (pur)', () => {
  it('le moment de la journée', () => {
    expect(careTime(5)).toBe('nuit');
    expect(careTime(7)).toBe('matin');
    expect(careTime(12)).toBe('jour');
    expect(careTime(19)).toBe('soir');
    expect(careTime(22)).toBe('nuit');
    expect(careTime(24 + 12)).toBe('jour');
  });

  it('midi plus clair que le matin et le soir, la nuit bien plus sombre avec une lampe', () => {
    const m = careAmbience({ hour: 8 });
    const j = careAmbience({ hour: 13 });
    const s = careAmbience({ hour: 19.5 });
    const n = careAmbience({ hour: 23 });
    expect(j.sun).toBeGreaterThan(m.sun);
    expect(j.sun).toBeGreaterThan(s.sun);
    expect(n.sun).toBeLessThan(0.3 * j.sun);
    expect(n.lamp).toBe(true);
    expect(j.lamp).toBe(false);
    // (le soir doré : le soleil plus rouge que bleu, plus qu'à midi)
    const warm = (c) => ((c >> 16) & 255) - (c & 255);
    expect(warm(s.tint)).toBeGreaterThan(warm(j.tint));
    // (le ciel de nuit est sombre)
    const lum = (c) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
    expect(lum(n.skyTop)).toBeLessThan(lum(j.skyTop) * 0.4);
  });

  it('pluie : sol mouillé, moins de soleil, ciel gris ; neige : sol blanc ; orage plus sombre que pluie', () => {
    const c = careAmbience({ hour: 13, weather: 'clear' });
    const r = careAmbience({ hour: 13, weather: 'rain' });
    const st = careAmbience({ hour: 13, weather: 'storm' });
    const sn = careAmbience({ hour: 13, weather: 'snow' });
    expect(r.wet).toBe(true);
    expect(st.wet).toBe(true);
    expect(c.wet).toBe(false);
    expect(sn.snowy).toBe(true);
    expect(r.sun).toBeLessThan(c.sun);
    expect(st.sun).toBeLessThan(r.sun);
    expect(careAmbience({ hour: 13, weather: 'heat' }).weather).toBe('clear');
    expect(careAmbience({ hour: 13, weather: 'nimporte' }).weather).toBe('clear');
    // le soir par gros temps : la lampe est déjà allumée
    expect(careAmbience({ hour: 20, weather: 'rain' }).lamp).toBe(true);
  });

  it('gameAmbience lit l\'heure, la météo et la saison du jeu', () => {
    const a = gameAmbience({ hour: 22, weather: 'snow', season: 'winter' });
    expect(a.time).toBe('nuit');
    expect(a.snowy).toBe(true);
    expect(a.season).toBe('winter');
    expect(gameAmbience(null).time).toBe('jour');
  });
});

describe('l\'ambiance dans la scène (pré du bétail)', () => {
  let decorFor;
  beforeAll(async () => {
    await loadFarm();
    ({ decorFor } = await import('../src/ui/minigames/care3d.js'));
  }, 120000);

  const lightsOf = (g) => {
    const out = [];
    g.traverse((o) => o.isLight && out.push(o));
    return out;
  };
  const sumOf = (sc, role) => lightsOf(sc.decor.group).filter((l) => (role === 'sun' ? l.castShadow : l.isHemisphereLight)).reduce((s, l) => s + l.intensity, 0);

  it('midi, soir, nuit : le soleil baisse, la nuit une lampe s\'allume ; le ciel change de couleur', () => {
    const res = {};
    for (const hour of [12, 19.5, 23]) {
      const amb = careAmbience({ hour, weather: 'clear' });
      const { sc } = farmStage({ species: 'goat', set: decorFor('goat', 'pre', { amb, kinds: [] }) });
      res[hour] = { sun: sumOf(sc, 'sun'), lamp: !!sc.decor.ambienceParts.lamp, bg: sc.scene.background.clone() };
      sc.dispose();
    }
    expect(res[19.5].sun).toBeLessThan(res[12].sun);
    expect(res[23].sun).toBeLessThan(res[19.5].sun);
    expect(res[23].lamp).toBe(true);
    expect(res[12].lamp).toBe(false);
    expect(res[23].bg.r + res[23].bg.g + res[23].bg.b).toBeLessThan(res[12].bg.r + res[12].bg.g + res[12].bg.b);
  });

  it('pluie : des gouttes qui tombent, le sol plus sombre ; à la fermeture, le sol redevient comme avant', () => {
    const { sc } = farmStage({ species: 'sheep', set: decorFor('sheep', 'pre', { amb: careAmbience({ hour: 13, weather: 'rain' }), kinds: [] }) });
    const A = sc.decor.ambienceParts;
    expect(A.rain).toBeTruthy();
    const pos = A.rain.geometry.attributes.position;
    const y0 = pos.getY(0);
    sc.update(0.1);
    expect(pos.getY(0)).not.toBe(y0);
    const g = sc.decor.ground[0];
    expect(g.color.r).toBeLessThan(0.8);
    expect(g.roughness).toBeLessThanOrEqual(0.55);
    sc.dispose();
    expect(g.roughness).toBe(1);
  });

  it('neige : des flocons, l\'herbe cachée, le sol blanc', () => {
    const { sc } = farmStage({ species: 'cow', set: decorFor('cow', 'pre', { amb: careAmbience({ hour: 11, weather: 'snow', season: 'winter' }), kinds: [] }) });
    const A = sc.decor.ambienceParts;
    expect(A.snow).toBeTruthy();
    const g = sc.decor.ground[0];
    expect(g.map).toBeNull();
    expect(g.color.r).toBeGreaterThan(0.75);
    let grass = 0;
    sc.decor.group.traverse((o) => {
      if (o.userData?.grass && o.visible) grass++;
    });
    expect(grass).toBe(0);
    sc.dispose();
  });

  it('dedans, la nuit : la fenêtre est bleu nuit, une lanterne éclaire ; sous la pluie, des gouttes sur la vitre', () => {
    const { sc } = farmStage({ species: 'goat', set: decorFor('goat', 'etable', { amb: careAmbience({ hour: 23, weather: 'rain' }), kinds: [] }) });
    const A = sc.decor.ambienceParts;
    expect(A.lamp).toBeTruthy();
    expect(A.lamp.isPointLight).toBe(true);
    let pane = null;
    sc.decor.group.traverse((o) => {
      if (o.userData?.window) pane = o;
    });
    expect(pane).toBeTruthy();
    const c = pane.material.color;
    expect(c.r + c.g + c.b).toBeLessThan(1.2);
    expect(c.b).toBeGreaterThan(c.r);
    // (le rai de soleil et les poussières : éteints)
    let shaft = 0;
    sc.decor.group.traverse((o) => {
      if (o.visible && o.material?.isShaderMaterial && o.material.blending === THREE.AdditiveBlending) shaft++;
    });
    expect(shaft).toBe(0);
    // (pas de pluie qui tombe dedans)
    expect(A.rain).toBeNull();
    sc.dispose();
  });

  it('tout ce que l\'ambiance ajoute est retiré et libéré', () => {
    const { sc } = farmStage({ species: 'goat', set: decorFor('goat', 'pre', { amb: careAmbience({ hour: 23, weather: 'snow' }), kinds: [] }) });
    const A = sc.decor.ambienceParts;
    const geos = [];
    A.group.traverse((o) => o.geometry && geos.push(o.geometry));
    let freed = 0;
    for (const g of geos) g.addEventListener('dispose', () => freed++);
    sc.dispose();
    expect(A.group.parent).toBeNull();
    expect(freed).toBe(geos.length);
  });
});
