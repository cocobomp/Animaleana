// Sangles de la bombe : collées aux joues (sur la peau, ou sur les cheveux rentrés dessous), au lieu de deux
// anneaux fixes de la coque qui flottaient à côté du visage.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { helmetStraps, helmetFit, helmetRim, HAIR_STYLES, STRAP_R, STRAP_GAP } from '../src/game/models/avatarHair.js';
import { headSdf } from '../src/game/models/avatarHead.js';

/** Repère de la bombe → repère de la tête (Player.wearHelmet). */
function toHead(fit) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(0, fit.y, fit.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(fit.tilt, 0, 0)),
    new THREE.Vector3(fit.scale, fit.scale, fit.scale),
  );
}

/** Points de l'ancien harnais (tackModels.helmetModel : tore r 0,06, arc 0,8 π), repère de la tête. */
function oldHarness(fit) {
  const M = toHead(fit);
  const pts = [];
  for (const s of [1, -1]) {
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(s * 0.1, -0.05, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, Math.PI * 1.1)),
      new THREE.Vector3(1, 1, 1),
    );
    for (let i = 0; i <= 20; i++) {
      const th = (i / 20) * Math.PI * 0.8;
      pts.push(new THREE.Vector3(0.06 * Math.cos(th), 0.06 * Math.sin(th), 0).applyMatrix4(local).applyMatrix4(M));
    }
  }
  return pts;
}

describe('sangles de la bombe', () => {
  it('l\'ancien harnais flottait : la plupart de ses points à plus d\'un centimètre de la peau', () => {
    const fit = helmetFit('short');
    const pts = oldHarness(fit).filter((p) => p.y < helmetRim(fit, 0)[1] - 0.01); // sous le bord de la coque
    const far = pts.filter((p) => headSdf(p.x, p.y, p.z) > 0.01);
    expect(far.length / pts.length).toBeGreaterThan(0.5);
  });

  it('chaque coiffure : sangles posées à STRAP_GAP de ce qui est dehors, jamais dans la peau', () => {
    for (const style of HAIR_STYLES) {
      const { paths, outer } = helmetStraps(style);
      expect(paths.length).toBe(5); // 2 sangles de chaque côté + la jugulaire
      for (const path of paths) {
        for (const p of path) {
          expect(Math.abs(outer(...p) - STRAP_GAP), style).toBeLessThan(0.0015);
          expect(headSdf(...p), style).toBeGreaterThan(STRAP_R); // la sangle (rayon STRAP_R) ne rentre pas dans la peau
        }
      }
    }
  });

  it('sans cheveux sur les joues (rasés) : collées à la peau, à moins de 5 mm sur tout le trajet sous la coque', () => {
    const fit = helmetFit('bald');
    const rimY = helmetRim(fit, 0)[1];
    const { paths } = helmetStraps('bald');
    for (const path of paths) {
      for (const p of path) if (p[1] < rimY - 0.01) expect(headSdf(...p)).toBeLessThan(0.005);
    }
  });

  it('elles partent de dessous la coque et se rejoignent à la boucle, sous l\'oreille, des deux côtés', () => {
    const fit = helmetFit('short');
    const { paths, buckles } = helmetStraps('short');
    expect(buckles.length).toBe(2);
    for (const [i, b] of buckles.entries()) {
      const s = i === 0 ? 1 : -1;
      expect(Math.sign(b.p[0])).toBe(s);
      expect(b.p[1]).toBeLessThan(0.02); // sous le lobe (oreille : y de 0,02 à 0,08)
      // Les deux sangles de ce côté : départ au niveau du bord de la coque, arrivée à la boucle.
      for (const path of paths.slice(i * 2, i * 2 + 2)) {
        expect(path[0][1]).toBeGreaterThan(helmetRim(fit, 0)[1] - 0.02);
        expect(Math.hypot(...path.at(-1).map((v, k) => v - b.p[k]))).toBeLessThan(0.002);
      }
    }
    // La jugulaire va d'une boucle à l'autre en passant sous le menton.
    const chin = paths[4];
    expect(Math.min(...chin.map((p) => p[1]))).toBeLessThan(-0.085);
  });
});
