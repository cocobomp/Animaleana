// Finitions des lapins réalistes vues de près (critique « chats-lapins ») : visage du bélier (truffe, moustaches, yeux),
// mèches de l'angora et du tête de lion (couchées, étroites, bouts translucides).
// ... Déterministe : graines fixes, aucun Math.random (le mixeur est appelé avec des états donnés).
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { buildRealRabbitModel } from '../src/game/models/rabbitReal.js';
import { rabbitBuild, rabbitLookWithBreed } from '../src/sim/rabbitLook.js';
import { resolveLook } from '../src/sim/animal.js';
import { loadRealRabbitGltf } from './fixtures/realRabbitGltf.js';
import { gfx } from '../src/game/gfx.js';

vi.setConfig({ testTimeout: 180000 });

let G;
beforeAll(async () => {
  G = { up: await loadRealRabbitGltf('up'), lop: await loadRealRabbitGltf('lop') };
}, 120000);

const lookOf = (breed, colorIndex = 0) => rabbitLookWithBreed({ ...resolveLook('rabbit', breed, colorIndex), seed: 4242 }, breed);
const rabbit = (breed, stage = 'adult', colorIndex = 0) => {
  const look = lookOf(breed, colorIndex);
  return buildRealRabbitModel(look, stage, G[rabbitBuild(look, stage).model]);
};

describe('visage du bélier', () => {
  // Le bout du nez était pris sur le sommet de tête le plus en avant, n'importe où : chez le bélier, le bord de la joue,
  // à 5,6 cm du milieu. Truffe d'origine gardée sur la joue (tache brune), moustaches parties du vide.
  it.each([['belier', 'adult'], ['belier', 'baby'], ['rex', 'adult']])('%s (%s) : bout du nez sur l\'axe du corps', (b, stage) => {
    const md = rabbit(b, stage);
    const L = md.anim.base.land;
    expect(Math.abs(L.nose.x - L.midX), `${b} repère`).toBeLessThan(0.005);
    expect(Math.abs(md.snoutTip[0] - L.midX), `${b} ${stage} mesuré`).toBeLessThan(0.005);
    md.dispose();
  });

  it.each([['belier', 'adult'], ['belier', 'baby'], ['rex', 'adult']])('%s (%s) : les moustaches partent de part et d\'autre du nez (moins de 3 cm d\'écart)', (b, stage) => {
    const md = rabbit(b, stage);
    md.staticPose('crouch');
    md.root.updateMatrixWorld(true);
    let w = null;
    md.root.traverse((o) => {
      if (o.userData?.whiskers) w = o;
    });
    expect(w, b).toBeTruthy();
    const p = w.geometry.attributes.position;
    const xs = [];
    for (let i = 0; i < p.count; i += 8) xs.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(w.matrixWorld).x);
    expect(Math.max(...xs) - Math.min(...xs), `${b} ${stage}`).toBeLessThan(0.03);
    md.dispose();
  });

  // Yeux peints dans la texture de 256 px (trous sombres déchirés) : repeints ronds à leur place mesurée sur la texture.
  it('bélier : yeux repeints ronds par la robe, à la place des yeux peints, rayon de 7 à 9 mm ; jamais pour les autres', () => {
    const md = rabbit('belier');
    const eyes = md.anim.base.land.eyes;
    expect(eyes[0].painted).toBe(true);
    expect(eyes[0].c.distanceTo(new THREE.Vector3(0.0319, 0.2809, 0.1035))).toBeLessThan(0.004);
    expect(eyes[1].c.x).toBeCloseTo(-eyes[0].c.x, 3);
    // (la robe reçoit le rayon des yeux peints : shader compilé à blanc)
    const compile = (m) => {
      const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <skinning_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>' };
      m.coatMesh.material.onBeforeCompile(sh);
      return sh;
    };
    const sh = compile(md);
    expect(sh.uniforms.cKeepOpt.value.z).toBeCloseTo(0.0078, 4);
    expect(sh.fragmentShader).toContain('cEyeIn');
    md.dispose();
    const rex = rabbit('rex');
    expect(rex.anim.base.land.eyes[0].painted).toBeFalsy();
    expect(compile(rex).uniforms.cKeepOpt.value.z).toBe(0);
    rex.dispose();
  });
});

describe('mèches de l\'angora et du tête de lion', () => {
  // Cartes plantées à 48° de la peau, larges de 2 cm et pleines : des copeaux de papier hérissés autour de la silhouette.
  const stats = (md) => {
    const g = md.cardMesh.geometry;
    const p = g.attributes.position;
    const nA = g.attributes.normal;
    const a = new THREE.Vector3();
    const t = new THREE.Vector3();
    const n = new THREE.Vector3();
    const ang = [];
    const wid = [];
    // (6 sommets par mèche : racine, milieu, bout — deux à deux ; normale de la peau où elle pousse)
    for (let i = 0; i < p.count; i += 6) {
      a.fromBufferAttribute(p, i).add(t.fromBufferAttribute(p, i + 1)).multiplyScalar(0.5);
      t.fromBufferAttribute(p, i + 4).add(n.fromBufferAttribute(p, i + 5)).multiplyScalar(0.5).sub(a).normalize();
      n.fromBufferAttribute(nA, i);
      ang.push((Math.acos(THREE.MathUtils.clamp(t.dot(n), -1, 1)) * 180) / Math.PI);
      wid.push(a.fromBufferAttribute(p, i + 2).distanceTo(t.fromBufferAttribute(p, i + 3)));
    }
    const med = (v) => [...v].sort((x, y) => x - y)[Math.floor(v.length / 2)];
    return { n: p.count / 6, ang: med(ang), wid: med(wid) };
  };

  it('angora : mèches couchées le long du corps (à plus de 60° de la normale), étroites (moins de 1,4 cm), plus nombreuses', () => {
    const md = rabbit('angora');
    const s = stats(md);
    expect(s.ang).toBeGreaterThan(60);
    expect(s.wid).toBeLessThan(0.014);
    expect(s.n).toBeGreaterThan(1500);
    md.dispose();
  });

  it('tête de lion : crinière courbée vers l\'arrière (à plus de 55° de la normale), mèches de moins de 1,7 cm', () => {
    const md = rabbit('tete_de_lion');
    const s = stats(md);
    expect(s.ang).toBeGreaterThan(55);
    expect(s.wid).toBeLessThan(0.017);
    md.dispose();
  });

  it('bouts translucides (alphaToCoverage) quand le rendu est anticrénelé ; découpés net sinon', () => {
    const was = { q: gfx.quality, m: gfx.msaa };
    const compile = (m) => {
      const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <skinning_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <alphatest_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_begin>' };
      m.onBeforeCompile(sh);
      return sh.fragmentShader;
    };
    try {
      for (const [q, msaa, on] of [['high', false, true], ['low', true, true], ['low', false, false]]) {
        gfx.quality = q;
        gfx.msaa = msaa;
        const md = rabbit('angora');
        const m = md.cardMesh.material;
        expect(m.alphaToCoverage, `${q} msaa ${msaa}`).toBe(on);
        const f = compile(m);
        expect(f.includes('#include <alphatest_fragment>'), `${q} msaa ${msaa}`).toBe(!on);
        if (on) {
          expect(f).toContain('smoothstep(0.1, 0.75, diffuseColor.a)');
          // (couleur gardée, alpha du cadre intact : rien du fond de la page ne passe au bord des brins)
          expect(m.blending).toBe(THREE.CustomBlending);
        }
        expect(md.coatMesh.material.alphaToCoverage).toBe(false);
        md.dispose();
      }
    } finally {
      gfx.quality = was.q;
      gfx.msaa = was.m;
    }
  });
});

describe('allures du bélier', () => {
  // La course du bélier (petits bonds, cadence naturelle à 0,92 m/s) était prise dès 0,78 m/s et jouée 1,3 fois trop vite
  // à 1,2 m/s (vitesse de marche du jeu) : lapin presque toujours en l'air, antérieurs posés 9 % du temps, et chez le
  // jeune et le lapereau qui patinaient de 1 à 1,9 cm par appui. Petit galop jusqu'à 1,25 m/s (taille 1).
  const track = (stage, v, frames = 240) => {
    const md = rabbit('belier', stage);
    md.staticPose('crouch');
    const a = md.anim;
    const m = md.coatMesh;
    const dt = 1 / 60;
    const _v = new THREE.Vector3();
    const step = () => {
      a.update(dt, { v, moving: true, posture: 'crouch' });
      md.root.position.z += v * dt;
      md.root.updateMatrixWorld(true);
    };
    for (let f = 0; f < 120; f++) step();
    const gait = a.gait;
    const soles = a.S.soles;
    const cur = [null, null];
    const slides = [[], []];
    for (let f = 0; f < frames; f++) {
      step();
      for (let l = 0; l < 2; l++) {
        if (cur[l]) {
          m.getVertexPosition(cur[l].i, _v).applyMatrix4(m.matrixWorld);
          if (_v.y < 0.004) {
            cur[l].d = Math.max(cur[l].d, Math.hypot(_v.x - cur[l].x, _v.z - cur[l].z));
            cur[l].n++;
            continue;
          }
          if (cur[l].n >= 3) slides[l].push(cur[l].d);
          cur[l] = null;
        }
        let lo = Infinity;
        let best = -1;
        for (const i of soles[l]) {
          const y = m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld).y;
          if (y < lo) {
            lo = y;
            best = i;
          }
        }
        if (lo < 0.004) {
          m.getVertexPosition(best, _v).applyMatrix4(m.matrixWorld);
          cur[l] = { i: best, x: _v.x, z: _v.z, d: 0, n: 0 };
        }
      }
    }
    md.dispose();
    return { gait, slides: slides.flat() };
  };

  it.each(['adult', 'young', 'baby'])('bélier (%s) : petit galop à 1,2 m/s, course en bonds à 1,6 m/s', (stage) => {
    expect(track(stage, 1.2, 1).gait).toBe('lope');
    expect(track(stage, 1.6, 1).gait).toBe('run');
  });

  it('jeune bélier à 1,2 m/s : les pieds avant posés glissent de moins de 7 mm par appui', () => {
    const { slides } = track('young', 1.2);
    expect(slides.length).toBeGreaterThan(2);
    const med = [...slides].sort((x, y) => x - y)[Math.floor(slides.length / 2)];
    expect(med).toBeLessThan(0.007);
  });
});

describe('poil long contre le sol', () => {
  // Ventre de l'angora, barbe et collerette du tête de lion de 15 à 30 mm sous le sol au sautillement et au petit galop :
  // le shader couche la peau du pelage sur le sol, au plus de l'épaisseur de son poil (attribut cmpFur, GROUND_V).
  it.each([['angora', 0.9], ['tete_de_lion', 0.9], ['angora', 0], ['tete_de_lion', 0.3]])('%s à %s m/s : poil couché sur le sol, rien dessous', (b, v) => {
    const md = rabbit(b);
    const m = md.coatMesh;
    const fur = m.geometry.attributes.cmpFur;
    expect(fur, 'épaisseur du poil par sommet').toBeTruthy();
    const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <skinning_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>' };
    m.material.onBeforeCompile(sh);
    expect(sh.vertexShader).toContain('attribute float cmpFur');
    expect(sh.vertexShader).toContain('transformed.y += min(under, max(cmpFur, 0.0) * 1.1)');
    const v3 = new THREE.Vector3();
    let raw = Infinity;
    let lifted = Infinity;
    for (let f = 0; f < 200; f++) {
      md.anim.update(1 / 60, { v, moving: v > 0, posture: 'crouch' });
      md.root.position.z += v / 60;
      md.root.updateMatrixWorld(true);
      if (f < 120 || f % 4) continue;
      for (let i = 0; i < m.geometry.attributes.position.count; i++) {
        const y = m.getVertexPosition(i, v3).y;
        raw = Math.min(raw, y);
        // (même calcul que GROUND_V, repère du lapin : sol à y = 0)
        const under = 0.0015 - y;
        lifted = Math.min(lifted, under > 0 ? y + Math.min(under, Math.max(0, fur.getX(i)) * 1.1) : y);
      }
    }
    expect(lifted, `${b} brut ${(raw * 1000).toFixed(1)} mm`).toBeGreaterThan(-0.001);
    md.dispose();
  });

  it('mèches (cartes) : jamais sous le sol', () => {
    const md = rabbit('angora');
    const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <skinning_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_begin>' };
    md.cardMesh.material.onBeforeCompile(sh);
    expect(sh.vertexShader).toContain('transformed.y = max(transformed.y, 0.0015)');
    md.dispose();
  });
});
