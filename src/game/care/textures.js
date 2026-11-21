// Textures peintes de la scène de soin (src/game/care/) : bois, paille, foin, filet, granulés… Chacune est neuve
// (pas de cache partagé) : la scène les libère toutes en se fermant.

import * as THREE from 'three';

/** Graine → nombres entre 0 et 1, toujours les mêmes (le décor ne change pas d'une fois à l'autre). */
export function rng(seed = 1) {
  let s = Math.max(1, Math.floor(seed * 9973) % 2147483646);
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Texture d'une toile peinte par draw(ctx2d, w, h). */
export function canvasTex(w, h, draw, { repeat = true, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 4;
  return t;
}

/** Planches de bois : veinures, nœuds, joints sombres. */
export function woodTexture({ base = '#9b6a3f', dark = '#5d3a1f', vertical = true, seed = 1, boards = 6 } = {}) {
  const S = 256;
  return canvasTex(S, S, (c) => {
    const r = rng(seed);
    c.fillStyle = base;
    c.fillRect(0, 0, S, S);
    const bw = S / boards;
    for (let b = 0; b < boards; b++) {
      // chaque planche un peu différente
      c.fillStyle = `rgba(${r() > 0.5 ? '255,235,200' : '40,20,5'},${0.04 + r() * 0.08})`;
      if (vertical) c.fillRect(b * bw, 0, bw, S);
      else c.fillRect(0, b * bw, S, bw);
      // veinures
      for (let i = 0; i < 26; i++) {
        c.strokeStyle = `rgba(60,30,10,${0.05 + r() * 0.12})`;
        c.lineWidth = 0.6 + r() * 1.4;
        c.beginPath();
        const o = b * bw + r() * bw;
        const amp = 1 + r() * 3;
        const ph = r() * 6;
        for (let k = 0; k <= S; k += 8) {
          const w = o + Math.sin(k * 0.03 + ph) * amp;
          if (vertical) (k === 0 ? c.moveTo(w, k) : c.lineTo(w, k));
          else (k === 0 ? c.moveTo(k, w) : c.lineTo(k, w));
        }
        c.stroke();
      }
      // nœud
      if (r() < 0.5) {
        const x = vertical ? b * bw + bw * (0.3 + r() * 0.4) : r() * S;
        const y = vertical ? r() * S : b * bw + bw * (0.3 + r() * 0.4);
        const g = c.createRadialGradient(x, y, 0, x, y, 7);
        g.addColorStop(0, dark);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(x, y, vertical ? 4 : 8, vertical ? 8 : 4, 0, 0, Math.PI * 2);
        c.fill();
      }
      // joint
      c.fillStyle = 'rgba(25,12,4,0.55)';
      if (vertical) c.fillRect(b * bw, 0, 2, S);
      else c.fillRect(0, b * bw, S, 2);
      c.fillStyle = 'rgba(255,240,210,0.12)';
      if (vertical) c.fillRect(b * bw + 2, 0, 1, S);
      else c.fillRect(0, b * bw + 2, S, 1);
    }
    // usure en bas (les sabots, la litière)
    const g = c.createLinearGradient(0, vertical ? S * 0.75 : 0, 0, S);
    g.addColorStop(0, 'rgba(40,25,10,0)');
    g.addColorStop(1, 'rgba(40,25,10,0.0)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
  });
}

/** Litière de paille vue d'en haut : brins dorés entremêlés, ombres entre eux. */
export function strawFloorTexture() {
  const S = 512;
  return canvasTex(S, S, (c) => {
    const r = rng(5);
    c.fillStyle = '#b8924a';
    c.fillRect(0, 0, S, S);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < 2600; i++) {
        const x = r() * S;
        const y = r() * S;
        const a = r() * Math.PI * 2;
        const l = 10 + r() * 34;
        const v = r();
        const light = pass === 2 ? 0.2 : 0;
        c.strokeStyle = v < 0.15 ? `rgba(110,75,30,${0.35 + r() * 0.3})`
          : `rgba(${235 + r() * 20},${200 + r() * 30 + light * 40},${110 + r() * 50},${0.45 + r() * 0.5})`;
        c.lineWidth = 1 + r() * 2.2;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 6, y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 6, x + Math.cos(a) * l, y + Math.sin(a) * l);
        c.stroke();
      }
    }
  });
}

/** Bruit doux d'une couleur (terre battue, caoutchouc…). */
export function noiseTexture(base = '#7a5a3c', amount = 0.15, seed = 1, S = 128) {
  return canvasTex(S, S, (c) => {
    const r = rng(seed);
    c.fillStyle = base;
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < S * S * 0.25; i++) {
      const v = r();
      c.fillStyle = v < 0.5 ? `rgba(0,0,0,${r() * amount})` : `rgba(255,255,255,${r() * amount * 0.7})`;
      c.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
    }
  });
}

/** Foin : brins vert-doré, plus fins et plus verts que la paille, avec des épis. */
export function hayTexture(seed = 3) {
  const S = 256;
  return canvasTex(S, S, (c) => {
    const r = rng(seed);
    c.fillStyle = '#9c8a3c';
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 2400; i++) {
      const x = r() * S;
      const y = r() * S;
      const a = (r() - 0.5) * 2.2 + Math.PI / 2;
      const l = 8 + r() * 26;
      const v = r();
      c.strokeStyle = v < 0.2 ? `rgba(70,80,30,${0.4 + r() * 0.3})` : v < 0.6 ? `rgba(${200 + r() * 40},${190 + r() * 40},${100 + r() * 40},${0.5 + r() * 0.5})`
        : `rgba(${150 + r() * 40},${160 + r() * 40},${70 + r() * 30},${0.5 + r() * 0.5})`;
      c.lineWidth = 0.8 + r() * 1.5;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 8, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      c.stroke();
    }
  });
}

/** Brins de foin isolés (cartes transparentes qui dépassent du filet). */
export function hayStrandTexture() {
  const W = 128;
  const H = 128;
  return canvasTex(W, H, (c) => {
    const r = rng(8);
    c.clearRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) {
      const x = 8 + r() * (W - 16);
      c.strokeStyle = r() < 0.4 ? `rgb(${150 + r() * 40},${160 + r() * 30},${70 + r() * 30})` : `rgb(${215 + r() * 30},${195 + r() * 40},${110 + r() * 40})`;
      c.lineWidth = 1.2 + r() * 1.6;
      c.beginPath();
      c.moveTo(x, H);
      c.quadraticCurveTo(x + (r() - 0.5) * 30, H * 0.5, x + (r() - 0.5) * 50, r() * H * 0.25);
      c.stroke();
    }
  }, { repeat: false });
}

/** Mailles du filet à foin : losanges en corde tressée, transparents entre les cordes. */
export function netTexture(color = [38, 92, 64]) {
  const S = 128;
  return canvasTex(S, S, (c) => {
    c.clearRect(0, 0, S, S);
    const [R, G, B] = color;
    const line = (x0, y0, x1, y1) => {
      // corde : bord sombre, milieu clair, petites torsades
      c.lineCap = 'round';
      c.strokeStyle = `rgb(${R * 0.45},${G * 0.45},${B * 0.45})`;
      c.lineWidth = 9;
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
      c.strokeStyle = `rgb(${R},${G},${B})`;
      c.lineWidth = 6;
      c.stroke();
      c.strokeStyle = `rgba(${Math.min(255, R * 1.8)},${Math.min(255, G * 1.6)},${Math.min(255, B * 1.6)},0.7)`;
      c.lineWidth = 2;
      c.stroke();
      const n = 9;
      c.strokeStyle = `rgba(0,0,0,0.35)`;
      c.lineWidth = 1.2;
      for (let i = 1; i < n; i++) {
        const k = i / n;
        const x = x0 + (x1 - x0) * k;
        const y = y0 + (y1 - y0) * k;
        c.beginPath();
        c.moveTo(x - 3, y + 3);
        c.lineTo(x + 3, y - 3);
        c.stroke();
      }
    };
    line(0, 0, S, S);
    line(S, 0, 0, S);
    line(-S / 2, S / 2, S / 2, S * 1.5);
    line(S / 2, -S / 2, S * 1.5, S / 2);
    line(S / 2, -S / 2, -S / 2, S / 2);
    line(S * 1.5, S / 2, S / 2, S * 1.5);
    // nœuds aux croisements
    c.fillStyle = `rgb(${R * 0.6},${G * 0.6},${B * 0.6})`;
    for (const [x, y] of [[S / 2, S / 2], [0, 0], [S, 0], [0, S], [S, S]]) {
      c.beginPath();
      c.arc(x, y, 6, 0, Math.PI * 2);
      c.fill();
    }
  });
}

/** Granulés : petits cylindres bruns serrés (le dessus du tas dans la mangeoire). */
export function pelletTexture() {
  const S = 256;
  return canvasTex(S, S, (c) => {
    const r = rng(12);
    c.fillStyle = '#6e4a26';
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      const x = r() * S;
      const y = r() * S;
      const a = r() * Math.PI;
      const l = 6 + r() * 5;
      const w = 3.2 + r() * 1.2;
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.fillStyle = `rgba(30,18,8,0.5)`;
      c.fillRect(-l / 2 + 1, -w / 2 + 1, l, w);
      const tone = 0.8 + r() * 0.4;
      c.fillStyle = `rgb(${Math.round(150 * tone)},${Math.round(104 * tone)},${Math.round(58 * tone)})`;
      c.fillRect(-l / 2, -w / 2, l, w);
      c.fillStyle = 'rgba(255,230,180,0.25)';
      c.fillRect(-l / 2, -w / 2, l, w * 0.35);
      c.restore();
    }
  });
}

/** Ondulations de l'eau (carte de normales douce), pour le seau. */
export function rippleNormal() {
  const S = 128;
  return canvasTex(S, S, (c) => {
    const img = c.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = (x / S) * Math.PI * 2;
        const v = (y / S) * Math.PI * 2;
        const dx = Math.cos(u * 3 + v) * 0.5 + Math.cos(u * 5 - v * 2) * 0.3;
        const dy = Math.cos(v * 4 - u) * 0.5 + Math.sin(v * 2 + u * 3) * 0.3;
        const i = (y * S + x) * 4;
        img.data[i] = 128 + dx * 40;
        img.data[i + 1] = 128 + dy * 40;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
  }, { srgb: false });
}

/** Tache douce (ombre de contact, éclaboussure…). */
export function softDot(rgba = '0,0,0', S = 64) {
  return canvasTex(S, S, (c) => {
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, `rgba(${rgba},1)`);
    g.addColorStop(0.5, `rgba(${rgba},0.5)`);
    g.addColorStop(1, `rgba(${rgba},0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
  }, { repeat: false });
}
