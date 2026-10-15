// Modèle 3D du personnage du joueur (regarde vers +Z, environ 1,6 m).

import * as THREE from 'three';

const mat = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });

function add(parent, geo, material, pos, rot, scale) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function buildAvatar(look) {
  const root = new THREE.Group();
  const skin = mat(look.skin, 0.7);
  const hair = mat(look.hair, 0.65);
  const top = mat(look.top);
  const bottom = mat(look.bottom);
  const shoes = mat(look.shoes, 0.6);
  const dark = mat(0x161616, 0.2);
  const white = mat(0xffffff, 0.3);

  const legs = [];
  for (const s of [1, -1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.095, 0.82, 0);
    root.add(hip);
    const leg = new THREE.CapsuleGeometry(0.075, 0.6, 4, 10);
    leg.translate(0, -0.37, 0);
    add(hip, leg, bottom, [0, 0, 0]);
    add(hip, new THREE.BoxGeometry(0.13, 0.08, 0.24), shoes, [0, -0.78, 0.04]);
    legs.push(hip);
  }

  const torso = new THREE.Group();
  root.add(torso);
  add(torso, new THREE.CapsuleGeometry(0.17, 0.32, 4, 14), top, [0, 1.08, 0], null, [1, 1, 0.72]);
  add(torso, new THREE.CylinderGeometry(0.17, 0.15, 0.14, 14), bottom, [0, 0.86, 0], null, [1, 1, 0.75]);

  const arms = [];
  for (const s of [1, -1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.24, 1.3, 0);
    shoulder.rotation.z = s * 0.08;
    root.add(shoulder);
    const arm = new THREE.CapsuleGeometry(0.055, 0.42, 4, 10);
    arm.translate(0, -0.26, 0);
    add(shoulder, arm, top, [0, 0, 0]);
    add(shoulder, new THREE.SphereGeometry(0.055, 10, 8), skin, [0, -0.56, 0]);
    arms.push(shoulder);
  }

  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  root.add(head);
  add(head, new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), skin, [0, -0.08, 0]);
  add(head, new THREE.SphereGeometry(0.13, 20, 16), skin, [0, 0.06, 0], null, [0.95, 1.05, 1]);
  for (const s of [1, -1]) {
    add(head, new THREE.SphereGeometry(0.022, 8, 8), white, [s * 0.045, 0.08, 0.115]);
    add(head, new THREE.SphereGeometry(0.013, 8, 8), dark, [s * 0.045, 0.08, 0.13]);
    add(head, new THREE.SphereGeometry(0.03, 8, 8), skin, [s * 0.128, 0.05, 0]);
  }
  add(head, new THREE.SphereGeometry(0.02, 8, 8), skin, [0, 0.04, 0.13]);
  add(head, new THREE.TorusGeometry(0.03, 0.007, 6, 12, Math.PI), mat(0xa0524a), [0, 0.005, 0.118], [0, 0, Math.PI]);

  // Cheveux
  const style = look.hairStyle;
  // Cheveux rasés : une calotte très fine qui épouse le crâne.
  const capSize = style === 'bald' ? [0.134, Math.PI * 0.42] : [0.138, Math.PI * 0.52];
  add(head, new THREE.SphereGeometry(capSize[0], 20, 12, 0, Math.PI * 2, 0, capSize[1]), hair, [0, 0.07, -0.005], [-0.25, 0, 0]);
  if (style === 'long') {
    add(head, new THREE.BoxGeometry(0.26, 0.32, 0.08), hair, [0, -0.06, -0.09]);
    for (const s of [1, -1]) add(head, new THREE.BoxGeometry(0.05, 0.24, 0.1), hair, [s * 0.12, -0.02, 0.0]);
  } else if (style === 'ponytail') {
    add(head, new THREE.SphereGeometry(0.04, 10, 8), hair, [0, 0.1, -0.14]);
    const tail = new THREE.CapsuleGeometry(0.035, 0.18, 4, 8);
    add(head, tail, hair, [0, -0.02, -0.17], [0.3, 0, 0]);
  } else if (style === 'curly') {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      add(head, new THREE.SphereGeometry(0.055, 10, 8), hair,
        [Math.cos(a) * 0.12, 0.13 + Math.sin(i * 1.7) * 0.03, Math.sin(a) * 0.1 - 0.02]);
    }
  }
  if (look.hat) {
    const cap = mat(look.top, 0.6);
    add(head, new THREE.SphereGeometry(0.142, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), cap, [0, 0.09, 0], [-0.15, 0, 0]);
    add(head, new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), cap, [0, 0.125, 0.09], [0.1, 0, 0], [1, 1, 1.1]);
  }

  return { root, legs, arms, head, torso };
}
