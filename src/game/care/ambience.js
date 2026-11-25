// L'heure, la météo et la saison du jeu dans la scène de soin (src/game/care/stage.js) : la lumière du matin, de midi,
// le soir doré, la nuit avec une lampe allumée ; la pluie (des gouttes qui tombent, le sol mouillé, des flaques), la
// neige (des flocons, le sol blanc), le brouillard ; le ciel dehors, et la fenêtre dedans (la nuit bleue, les gouttes
// sur la vitre). L'ambiance elle-même (couleurs, forces) vient de careAmbience (setting.js, sans 3D, testée).
//
// applyAmbience(stage, decor, amb) règle les lumières du décor (rôle : userData.role, sinon deviné : l'hémisphère est
// le ciel, la lumière qui fait les ombres est le soleil, les autres débouchent), ajoute ce qu'il faut (pluie, neige,
// flaques, lampe) dans le groupe du décor, et renvoie { update(dt, stage), dispose() } : tout ce qu'il crée est libéré.

import * as THREE from 'three';
import { canvasTex, rng, softDot } from './textures.js';
import { lantern, bag } from './barnProps.js';
import { animalBox } from './extras.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Le rôle d'une lumière du décor : 'sun', 'sky', 'fill' (ou celui qu'on lui a donné). */
function roleOf(l) {
  if (l.userData.role) return l.userData.role;
  if (l.isHemisphereLight) return 'sky';
  if (l.isDirectionalLight && l.castShadow) return 'sun';
  if (l.isAmbientLight) return 'sky';
  return 'fill';
}

/** Gouttes de pluie sur une vitre, ou flocons derrière : la texture qu'on fait glisser devant la fenêtre. */
function paneTexture(kind) {
  return canvasTex(128, 256, (c) => {
    const r = rng(kind === 'snow' ? 31 : 32);
    c.clearRect(0, 0, 128, 256);
    if (kind === 'snow') {
      for (let i = 0; i < 90; i++) {
        c.fillStyle = `rgba(255,255,255,${0.5 + r() * 0.5})`;
        c.beginPath();
        c.arc(r() * 128, r() * 256, 1 + r() * 2.2, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      c.strokeStyle = 'rgba(210,225,240,0.55)';
      for (let i = 0; i < 70; i++) {
        const x = r() * 128;
        const y = r() * 256;
        c.lineWidth = 0.8 + r();
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - 3, y + 14 + r() * 16);
        c.stroke();
      }
      for (let i = 0; i < 40; i++) {
        c.fillStyle = 'rgba(220,235,250,0.5)';
        c.beginPath();
        c.ellipse(r() * 128, r() * 256, 1.5 + r() * 2, 2 + r() * 3, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
  }, { key: `pane-${kind}` });
}

/** Une couche de neige au sol : du blanc par plaques (l'herbe perce un peu). */
function snowTexture() {
  return canvasTex(256, 256, (c) => {
    const r = rng(41);
    c.fillStyle = 'rgba(255,255,255,0.86)';
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 160; i++) {
      c.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.14})`;
      c.beginPath();
      c.arc(r() * 256, r() * 256, 4 + r() * 18, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 70; i++) {
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.35})`;
      c.beginPath();
      c.ellipse(r() * 256, r() * 256, 2 + r() * 7, 1 + r() * 4, r() * 3, 0, Math.PI * 2);
      c.fill();
      c.globalCompositeOperation = 'source-over';
    }
  }, { key: 'snow-cover' });
}

/** Un réverbère de jardin ou de pré : un poteau, un bras, la lanterne au bout. h : la hauteur du crochet. */
function lampPost(keep, h) {
  const g = new THREE.Group();
  const wood = keep(new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.9 }));
  const post = new THREE.Mesh(keep(new THREE.BoxGeometry(0.08, h + 0.1, 0.08)), wood);
  post.position.y = (h + 0.1) / 2;
  post.castShadow = true;
  g.add(post);
  const arm = new THREE.Mesh(keep(new THREE.BoxGeometry(0.32, 0.05, 0.05)), wood);
  arm.position.set(0.14, h + 0.05, 0);
  g.add(arm);
  const lamp = lantern(keep);
  lamp.position.set(0.27, h + 0.02, 0);
  g.add(lamp);
  g.userData.light = V(0.27, h - 0.13, 0);
  return g;
}

/**
 * Habille la scène selon l'ambiance amb (careAmbience). decor : { group, outdoor, sky, ground, spots, dims, room } ;
 * stage : la scène (marks, box, camera, scene). Renvoie { update(dt, stage), dispose(), lamp, rain, snow }.
 */
export function applyAmbience(stage, decor, amb) {
  const keep = bag();
  const g = new THREE.Group();
  g.name = 'ambiance';
  decor.group.add(g);
  const out = !!decor.outdoor;
  const box = animalBox(stage);
  const size = box.getSize(V());
  const center = box.getCenter(V());
  const u = Math.max(0.25, size.y);
  const tint = new THREE.Color(amb.tint);
  const skyTop = new THREE.Color(amb.skyTop);
  const skyLow = new THREE.Color(amb.skyLow);
  const night = amb.time === 'nuit';

  // ---------------------------------------------------------------- les lumières du décor
  const lights = [];
  decor.group.traverse((o) => {
    if (o.isLight && o !== g) lights.push(o);
  });
  for (const l of lights) {
    const role = roleOf(l);
    const base = l.intensity;
    if (role === 'sun') {
      // (dedans, c'est le jour qui entre par la porte : il suit le dehors, sans changer de direction)
      l.intensity = base * Math.max(out ? 0.12 : 0.18, amb.sun);
      l.color.lerp(tint, 0.75);
      if (out && l.target) {
        // le soleil bas le matin (de gauche) et le soir (de droite), haut à midi ; la lune, haute, la nuit
        const t = l.target.position;
        const d = l.position.clone().sub(t);
        const r = d.length();
        const elev = { matin: 0.42, jour: 1.0, soir: 0.3, nuit: 0.95 }[amb.time] ?? 1;
        const side = amb.time === 'soir' ? 1 : -1;
        const flat = Math.hypot(d.x, d.z) || 1;
        const dir = V((side * Math.abs(d.x)) / flat, 0, d.z / flat);
        l.position.copy(t).addScaledVector(dir, r * Math.cos(elev)).add(V(0, r * Math.sin(elev), 0));
      }
    } else if (role === 'sky') {
      l.intensity = base * amb.sky * (night && !out ? 0.7 : 1);
      l.color.lerp(skyTop, night ? 0.55 : 0.3);
      if (l.groundColor && night) l.groundColor.multiplyScalar(0.5);
    } else if (role === 'fill') {
      l.intensity = base * Math.max(0.25, Math.min(1, amb.sky));
      if (night) l.color.lerp(skyTop, 0.5);
    }
  }

  // le rai de soleil, les poussières, la tache de soleil : seulement quand le soleil entre
  const sunny = amb.sun > 0.5;
  decor.group.traverse((o) => {
    const mt = o.material;
    if (!mt || Array.isArray(mt) || o === g) return;
    if (mt.blending === THREE.AdditiveBlending && (o.isPoints || mt.isShaderMaterial || mt.isMeshBasicMaterial)) {
      if (!sunny) o.visible = false;
      else if (amb.time === 'soir' && mt.color) mt.color.lerp(tint, 0.5);
    }
  });

  // ---------------------------------------------------------------- le ciel, la brume
  const sc = stage.scene;
  if (out) {
    // (le ciel : decor.skyMesh, ou decor.sky quand c'est lui — le pré de la balle et le rond de longe ont une méthode sky)
    const skyM = decor.skyMesh ?? (decor.sky?.isMesh ? decor.sky : null);
    skyM?.setColors?.(skyTop, skyLow);
    sc.background = skyLow.clone();
    const fogCol = skyLow.clone().lerp(skyTop, 0.3);
    // (un grand décor — le rond de longe, ses arbres tout autour — : la brume plus loin, decor.fogScale)
    const k = Math.max(1, decor.fogScale ?? 1);
    const near = (amb.foggy ? 3 : amb.snowy ? 8 : amb.wet ? 9 : 14) * k;
    const far = (amb.foggy ? 16 : amb.snowy || amb.wet ? 26 : 36) * k;
    sc.fog = new THREE.Fog(fogCol, near, far);
    // (le brouillard, la nuit : le ciel se voit à peine)
    if (skyM && (amb.foggy || night)) skyM.material.fog = false;
  }
  sc.environmentIntensity = (sc.environmentIntensity ?? 0.45) * Math.max(0.35, Math.min(1, (amb.sun + amb.sky) / 2));

  // ---------------------------------------------------------------- les fenêtres : la nuit, la pluie, la neige
  const overlays = [];
  decor.group.traverse((o) => {
    const w = o.userData?.window;
    if (!w || !o.material) return;
    const m = o.material;
    if (w.inside) {
      // (vue du jardin : la pièce derrière la vitre ; le soir et la nuit, la lampe est allumée dedans)
      if (night || amb.time === 'soir' || amb.lamp) m.color.set(0xffc27a).multiplyScalar(night ? 1.25 : 0.95);
      return;
    }
    const k = night ? 0.22 : amb.time === 'soir' ? 0.85 : 1;
    m.color.setRGB(1, 1, 1).lerp(skyLow, night ? 0.85 : amb.weather === 'clear' ? 0.15 : 0.55).multiplyScalar(w.bright * k);
    if (amb.wet || amb.snowy) {
      const tex = keep(paneTexture(amb.snowy ? 'snow' : 'rain'));
      tex.repeat.set(1, 1);
      const pm = keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, color: night ? 0x8090b0 : 0xffffff }));
      const ov = new THREE.Mesh(keep(new THREE.PlaneGeometry(w.w, w.h)), pm);
      ov.position.copy(o.position).add(V(0, 0, 0.004));
      ov.rotation.copy(o.rotation);
      ov.renderOrder = 6;
      o.parent.add(ov);
      overlays.push({ ov, tex, speed: amb.snowy ? 0.05 : 0.6 });
    }
  });

  const WB0 = decor.weatherBox ?? null;
  // ---------------------------------------------------------------- le sol : mouillé, ou blanc de neige
  const grounds = (decor.ground ?? []).filter(Boolean);
  const saved = grounds.map((m) => ({ m, color: m.color.clone(), rough: m.roughness, map: m.map }));
  const hidden = [];
  if (amb.wet) {
    for (const m of grounds) {
      m.color.multiplyScalar(0.72);
      m.roughness = Math.min(m.roughness, 0.55);
    }
  }
  if (amb.snowy) {
    // (la neige recouvre l'herbe : le sol blanc, les touffes et les fleurs dessous)
    for (const m of grounds) {
      m.map = null;
      m.color.set(0xe6ecf2);
      m.needsUpdate = true;
    }
    decor.group.traverse((o) => {
      if (o.userData?.grass && o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    });
  }
  if (night) for (const m of grounds) m.color.multiplyScalar(0.6);
  if (out && amb.snowy) {
    const st = keep(snowTexture());
    st.repeat.set(6, 6);
    const cs = WB0 ? Math.max(30, (WB0.x1 - WB0.x0) * 2, (WB0.z1 - WB0.z0) * 2) : 30;
    const cover = new THREE.Mesh(keep(new THREE.PlaneGeometry(cs, cs)), keep(new THREE.MeshStandardMaterial({ map: st, transparent: true, depthWrite: false, roughness: 0.9, color: 0xffffff })));
    cover.rotation.x = -Math.PI / 2;
    if (WB0) cover.position.set((WB0.x0 + WB0.x1) / 2, 0.006, (WB0.z0 + WB0.z1) / 2);
    else cover.position.set(center.x, 0.006, center.z - 4);
    cover.receiveShadow = true;
    cover.renderOrder = 1;
    g.add(cover);
  }
  // des flaques (là où l'on pose les objets du jour : jamais sous lui ni sous ses gamelles)
  if (out && amb.wet) {
    const pm = keep(new THREE.MeshStandardMaterial({ color: 0x4a5866, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.85, depthWrite: false }));
    const pg = keep(new THREE.CircleGeometry(1, 24));
    const floors = (decor.spots ?? []).filter((s) => s.kind === 'floor');
    const r = rng(77);
    for (let i = 0; i < Math.min(4, floors.length); i++) {
      const s = floors[Math.floor(r() * floors.length)];
      const p = new THREE.Mesh(pg, pm);
      p.rotation.x = -Math.PI / 2;
      p.position.set(s.p[0] + (r() - 0.5) * 0.3, (s.p[1] ?? 0) + 0.008 + i * 0.0005, s.p[2] + 0.15);
      const k = 0.12 + r() * 0.18 * Math.max(0.6, u);
      p.scale.set(k * 1.6, k, 1);
      p.renderOrder = 2;
      g.add(p);
    }
  }

  // ---------------------------------------------------------------- la pluie, la neige qui tombent (dehors)
  // (là où elle tombe : autour de lui ; ou toute la zone du jeu quand il s'y promène, decor.weatherBox)
  const WB = decor.weatherBox ?? null;
  const cx = WB ? (WB.x0 + WB.x1) / 2 : center.x;
  const spanX = WB ? WB.x1 - WB.x0 : Math.max(5, size.x * 3);
  const zMin = WB ? WB.z0 : center.z - Math.max(2.5, size.z * 3);
  const zMax = WB ? WB.z1 : center.z + Math.max(4, u * 4);
  const top = WB?.top ?? Math.max(3, u * 3);
  // (une grande zone : plus de gouttes et de flocons, pour la même pluie à l'image ; au plus le double)
  const dense = WB ? Math.min(2, Math.max(1, (spanX * (zMax - zMin)) / 60)) : 1;
  let rain = null;
  let snow = null;
  const high = stage.high;
  if (out && amb.wet) {
    const n = Math.round((amb.weather === 'storm' ? 1.5 : 1) * (high ? 520 : 320) * dense);
    const pos = new Float32Array(n * 6);
    const seeds = new Float32Array(n * 3);
    const r = rng(5);
    for (let i = 0; i < n; i++) {
      seeds[i * 3] = cx + (r() - 0.5) * spanX;
      seeds[i * 3 + 1] = r() * top;
      seeds[i * 3 + 2] = zMin + r() * (zMax - zMin);
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = keep(new THREE.LineBasicMaterial({ color: night ? 0x8090a8 : 0xe4ecf4, transparent: true, opacity: 0.75, depthWrite: false }));
    rain = new THREE.LineSegments(geo, mat);
    rain.frustumCulled = false;
    rain.renderOrder = 7;
    g.add(rain);
    const speed = amb.weather === 'storm' ? 11 : 8;
    const len = 0.34;
    const slant = amb.weather === 'storm' ? 0.35 : 0.15;
    rain.userData.step = (dt) => {
      for (let i = 0; i < n; i++) {
        let y = seeds[i * 3 + 1] - speed * dt;
        if (y < 0) y += top;
        seeds[i * 3 + 1] = y;
        const x = seeds[i * 3] + slant * (y - top / 2) * 0.2;
        const z = seeds[i * 3 + 2];
        pos.set([x, y, z, x + slant * len * 0.3, y + len, z], i * 6);
      }
      geo.attributes.position.needsUpdate = true;
    };
    rain.userData.step(0);
  }
  if (out && amb.snowy) {
    const n = Math.round((high ? 420 : 260) * dense);
    const pos = new Float32Array(n * 3);
    const seeds = [];
    const r = rng(6);
    for (let i = 0; i < n; i++) seeds.push({ x: cx + (r() - 0.5) * spanX, y: r() * top, z: zMin + r() * (zMax - zMin), a: r() * 6.28, s: 0.35 + r() * 0.4 });
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = keep(softDot('255,255,255', 32));
    const mat = keep(new THREE.PointsMaterial({ size: Math.max(0.035, 0.045 * u), map: dot, transparent: true, depthWrite: false, color: 0xffffff, opacity: 0.95 }));
    snow = new THREE.Points(geo, mat);
    snow.frustumCulled = false;
    snow.renderOrder = 7;
    g.add(snow);
    let t = 0;
    snow.userData.step = (dt) => {
      t += dt;
      for (let i = 0; i < n; i++) {
        const f = seeds[i];
        f.y -= f.s * dt;
        if (f.y < 0) f.y += top;
        pos[i * 3] = f.x + Math.sin(t * 0.8 + f.a) * 0.12;
        pos[i * 3 + 1] = f.y;
        pos[i * 3 + 2] = f.z + Math.cos(t * 0.6 + f.a) * 0.08;
      }
      geo.attributes.position.needsUpdate = true;
    };
    snow.userData.step(0);
  }

  // ---------------------------------------------------------------- la lampe (la nuit ; le soir par gros temps)
  let lamp = null;
  if (amb.lamp) {
    const light = new THREE.PointLight(0xffb866, 1, 0, 2);
    let at;
    if (out) {
      // un réverbère au fond, à gauche de lui (il éclaire son flanc et le coin repas) ; ou à la place que le décor
      // lui garde (decor.lampSpot : hors du terrain de jeu)
      const h = Math.max(1.1, Math.min(2.3, u * 1.5 + 0.3));
      const post = lampPost(keep, h);
      const back = decor.dims?.back ?? decor.room?.back ?? box.min.z - 0.6;
      post.position.set(box.min.x + size.x * 0.15, 0, Math.min(back + 0.15, box.min.z - 0.2));
      if (decor.lampSpot) {
        post.position.copy(decor.lampSpot);
        post.rotation.y = decor.lampFace ?? 0;
      }
      post.updateMatrixWorld(true);
      g.add(post);
      at = post.localToWorld(post.userData.light.clone());
    } else {
      // la lanterne accrochée au plafond, au-dessus de lui, un peu vers nous
      const roof = decor.dims?.roof ?? decor.dims?.eave ?? decor.room?.roof ?? 2.6;
      const l = lantern(keep);
      l.position.set(center.x - size.x * 0.2, Math.min(roof - 0.15, box.max.y + 0.9), center.z + size.z * 0.6 + 0.3);
      g.add(l);
      at = l.position.clone().add(V(0, -0.13, 0));
    }
    light.position.copy(at);
    // (assez fort pour bien le voir : sa lumière à la distance de son flanc vaut un peu plus que le ciel de nuit)
    // (un réverbère que le décor a mis à l'écart — le pré de la balle — : pas plus fort pour autant, il éblouirait le mur)
    const d = Math.max(0.8, Math.min(decor.lampSpot ? 1.6 : 99, at.distanceTo(center)));
    light.intensity = 1.9 * d * d;
    light.userData.role = 'lamp';
    light.userData.base = light.intensity;
    g.add(light);
    lamp = light;
  }

  let time = 0;
  return {
    lamp,
    rain,
    snow,
    group: g,
    update(dt) {
      time += dt;
      rain?.userData.step(Math.min(dt, 0.1));
      snow?.userData.step(Math.min(dt, 0.1));
      for (const o of overlays) o.tex.offset.y = (o.tex.offset.y + o.speed * dt) % 1;
      // (la flamme de la lampe vacille un peu)
      if (lamp) lamp.intensity = lamp.userData.base * (1 + Math.sin(time * 13) * 0.02 + Math.sin(time * 7.3) * 0.015);
    },
    dispose() {
      for (const s of saved) {
        s.m.color.copy(s.color);
        s.m.roughness = s.rough;
        if (s.m.map !== s.map) {
          s.m.map = s.map;
          s.m.needsUpdate = true;
        }
      }
      for (const o of hidden) o.visible = true;
      for (const o of overlays) o.ov.parent?.remove(o.ov);
      g.parent?.remove(g);
      lamp?.dispose?.();
      keep.dispose();
    },
  };
}
