import { it } from 'vitest';
import * as THREE from 'three';
import fs from 'node:fs';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

it('probe', async () => {
  const gltf = await loadRealHorseGltf();
  const hr = await import('../src/game/models/horseReal.js');
  const animalMod = await import('../src/sim/animal.js');
  hr.realHorseBase(gltf);
  const out = {};
  for (const breed of ['appaloosa', 'shetland', 'selle_francais']) {
    const a = animalMod.createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: 1500, seed: 77 });
    const md = hr.buildRealHorseModel(animalMod.stageLook(a), a.breed, gltf);
    const mesh = md.coatMesh;
    const g = mesh.geometry;
    const sk = mesh.skeleton;
    const hi = sk.bones.findIndex((b) => b.name === 'Head');
    const bone = sk.bones[hi];
    const Grest = sk.boneInverses[hi].clone().invert().multiply(bone.matrix.clone().invert());
    const inv = Grest.clone().invert();
    const P = g.attributes.position;
    const si = g.attributes.skinIndex;
    const sw = g.attributes.skinWeight;
    const pts = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hi) w += sw.getComponent(i, k);
      if (w < 0.3) continue;
      v.fromBufferAttribute(P, i).applyMatrix4(inv);
      pts.push([i, +v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4), +w.toFixed(2)]);
    }
    // boundary edges among head verts
    const idx = g.index.array;
    const edges = new Map();
    for (let t = 0; t < idx.length; t += 3) for (const [a, b] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) {
      const k = a < b ? a + '_' + b : b + '_' + a;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
    const bnd = [];
    for (const [k, c] of edges) if (c === 1) bnd.push(k.split('_').map(Number));
    const hs=new Set(pts.map(q=>q[0]));const tris=[];for(let t=0;t<idx.length;t+=3){if(hs.has(idx[t])&&hs.has(idx[t+1])&&hs.has(idx[t+2]))tris.push([idx[t],idx[t+1],idx[t+2]]);}
    out[breed] = { tris, uv: Array.from(g.attributes.uv?.array ?? []).length, dims: md.dims, mouth: md.mouth.toArray(), snoutTip: md.snoutTip, count: P.count, pts, bnd: bnd.length, morph: Object.keys(g.morphAttributes) };
  }
  fs.writeFileSync('/tmp/claude-0/-home-user-Animaleana/a76b290b-8fad-5b82-bb22-05b8d1fcd409/scratchpad/bride/probe.json', JSON.stringify(out));
}, 120000);
