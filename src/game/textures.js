// Textures dessinées par le code (pelage, sol, panneaux) : aucun fichier à télécharger.

import * as THREE from 'three';
import { mulberry32 } from '../sim/rng.js';

const cache = new Map();

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

function shade(c, f) {
  const r = Math.min(255, Math.max(0, ((c >> 16) & 255) * f));
  const g = Math.min(255, Math.max(0, ((c >> 8) & 255) * f));
  const b = Math.min(255, Math.max(0, (c & 255) * f));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function furStrokes(ctx, w, h, color, rng, count) {
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const len = 2 + rng() * 5;
    ctx.strokeStyle = shade(color, 0.82 + rng() * 0.36);
    ctx.globalAlpha = 0.35 + rng() * 0.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 2, y + len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function blob(ctx, x, y, r, rng) {
  ctx.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.7 + rng() * 0.5);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.8;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/** Pelage : couleur de base + motif (tigré, taches, plaques, tricolore). */
export function furTexture(look) {
  const pattern = ['tabby', 'spots', 'patches', 'tricolor'].includes(look.pattern) ? look.pattern : 'solid';
  const key = `fur-${pattern}-${look.coat}-${look.secondary}-${look.third}-${look.seed % 6}`;
  if (cache.has(key)) return cache.get(key);
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(look.seed);
  ctx.fillStyle = hex(look.coat);
  ctx.fillRect(0, 0, w, h);

  if (pattern === 'tabby') {
    ctx.fillStyle = hex(look.secondary);
    ctx.globalAlpha = 0.75;
    for (let x = 0; x < w; x += 14 + rng() * 8) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= h; y += 8) ctx.lineTo(x + Math.sin(y * 0.08 + x) * 4, y);
      for (let y = h; y >= 0; y -= 8) ctx.lineTo(x + 4 + rng() * 3 + Math.sin(y * 0.08 + x) * 4, y);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (pattern === 'spots') {
    ctx.fillStyle = hex(look.secondary);
    for (let i = 0; i < 70; i++) blob(ctx, rng() * w, rng() * h, 2 + rng() * 4, rng);
  } else if (pattern === 'patches') {
    ctx.fillStyle = hex(look.secondary);
    for (let i = 0; i < 6; i++) blob(ctx, rng() * w, rng() * h, 14 + rng() * 22, rng);
  } else if (pattern === 'tricolor') {
    ctx.fillStyle = hex(look.third);
    for (let i = 0; i < 4; i++) blob(ctx, rng() * w, h * 0.3 + rng() * h * 0.4, 18 + rng() * 20, rng);
  }
  furStrokes(ctx, w, h, look.coat, rng, 2200);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  cache.set(key, tex);
  return tex;
}

/** Petite texture de poils unie, pour les parties d'une seule couleur. */
export function plainFur(color) {
  const key = `plain-${color}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hex(color);
  ctx.fillRect(0, 0, 64, 64);
  furStrokes(ctx, 64, 64, color, mulberry32(color), 300);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  cache.set(key, tex);
  return tex;
}

/** Texture de détail pour le sol (herbe, sable, neige), répétée sur le terrain. */
export function groundDetail() {
  if (cache.has('ground')) return cache.get('ground');
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  const rng = mulberry32(7);
  for (let i = 0; i < 9000; i++) {
    const v = 200 + rng() * 55;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 3);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 60);
  cache.set('ground', tex);
  return tex;
}

/** Panneau avec du texte (refuge, vétérinaire…). */
export function signTexture(text, bg = '#6b4a2f', fg = '#fff8e8', emoji = '') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 120);
  ctx.fillStyle = fg;
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${emoji} ${text}`.trim(), 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Sprite emoji (cœurs, zzz, bulles d'humeur). */
export function emojiTexture(emoji) {
  const key = `emoji-${emoji}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '48px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 32, 36);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}
