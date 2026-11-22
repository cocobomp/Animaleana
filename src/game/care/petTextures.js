// Textures peintes des décors des animaux de compagnie (src/game/care/home.js, hutch.js, petProps.js) : parquet,
// enduit, boiseries peintes, tissus du panier, tapis tressé, terre cuite, feuilles, jardin derrière la porte-fenêtre,
// gamelle à son nom, sac de croquettes… Comme textures.js : la peinture est tirée d'une graine (toujours la même)
// et gardée d'une ouverture à l'autre ; chaque texture est neuve et libérée à la fermeture de la scène.

import { canvasTex, rng } from './textures.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const css = (c) => (typeof c === 'number' ? hex(c) : c);

/** Parquet de chêne : longues lames, veinures, nœuds, joints fins, quelques lames plus claires ou plus foncées. */
export function parquetTexture({ base = '#b88a5a', seed = 4 } = {}) {
  const S = 512;
  return canvasTex(S, S, (c) => {
    const r = rng(seed);
    c.fillStyle = base;
    c.fillRect(0, 0, S, S);
    const rows = 6;
    const h = S / rows;
    for (let row = 0; row < rows; row++) {
      // des lames décalées d'une rangée à l'autre
      let x = -r() * S * 0.6;
      while (x < S) {
        const w = S * (0.45 + r() * 0.4);
        const tone = r();
        c.fillStyle = tone < 0.3 ? `rgba(70,40,15,${0.06 + r() * 0.1})` : tone > 0.75 ? `rgba(255,235,200,${0.05 + r() * 0.1})` : 'rgba(0,0,0,0)';
        c.fillRect(x, row * h, w, h);
        // veinures longues et ondulées
        for (let k = 0; k < 9; k++) {
          const y0 = row * h + r() * h;
          c.strokeStyle = `rgba(${r() < 0.5 ? '90,55,25' : '60,35,15'},${0.1 + r() * 0.16})`;
          c.lineWidth = 0.6 + r() * 1.4;
          c.beginPath();
          c.moveTo(x, y0);
          const a = r() * 3;
          for (let t = 0; t <= 1.001; t += 0.1) c.lineTo(x + w * t, y0 + Math.sin(t * 6 + a) * (1 + r() * 2));
          c.stroke();
        }
        if (r() < 0.35) {
          const kx = x + r() * w;
          const ky = row * h + h * (0.3 + r() * 0.4);
          const g = c.createRadialGradient(kx, ky, 0, kx, ky, 6 + r() * 5);
          g.addColorStop(0, 'rgba(70,40,15,0.55)');
          g.addColorStop(1, 'rgba(70,40,15,0)');
          c.fillStyle = g;
          c.beginPath();
          c.ellipse(kx, ky, 12, 5, 0, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = 'rgba(45,25,10,0.55)';
        c.fillRect(x, row * h, 1.5, h);
        x += w;
      }
      c.fillStyle = 'rgba(45,25,10,0.5)';
      c.fillRect(0, row * h, S, 1.6);
      c.fillStyle = 'rgba(255,240,215,0.12)';
      c.fillRect(0, row * h + 1.6, S, 1.2);
    }
  }, { key: `parquet|${base}|${seed}` });
}

/** Enduit peint : une couleur douce, à peine nuageuse, avec un grain fin. */
export function plasterTexture(base = '#efe2c8', seed = 2) {
  const S = 256;
  return canvasTex(S, S, (c) => {
    const r = rng(seed);
    c.fillStyle = base;
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) {
      const x = r() * S;
      const y = r() * S;
      const g = c.createRadialGradient(x, y, 0, x, y, 20 + r() * 50);
      const l = r() < 0.5;
      g.addColorStop(0, `rgba(${l ? '255,250,240' : '150,120,90'},${0.04 + r() * 0.04})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, S, S);
    }
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.05})` : `rgba(255,255,255,${r() * 0.06})`;
      c.fillRect(r() * S, r() * S, 1, 1);
    }
  }, { key: `plaster|${base}|${seed}` });
}

/** Boiserie peinte (lambris) : lames verticales, joints creux, la peinture un peu plus claire sur les arêtes. */
export function wainscotTexture(base = '#9db5a4', seed = 3) {
  const S = 256;
  return canvasTex(S, S, (c) => {
    const r = rng(seed);
    c.fillStyle = base;
    c.fillRect(0, 0, S, S);
    const n = 4;
    const w = S / n;
    for (let i = 0; i < n; i++) {
      const x = i * w;
      const g = c.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(0.15, 'rgba(255,255,255,0)');
      g.addColorStop(0.85, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.12)');
      c.fillStyle = g;
      c.fillRect(x, 0, w, S);
      c.fillStyle = 'rgba(30,40,30,0.35)';
      c.fillRect(x, 0, 2, S);
      for (let k = 0; k < 300; k++) {
        c.fillStyle = `rgba(255,255,255,${r() * 0.05})`;
        c.fillRect(x + r() * w, r() * S, 1, 2 + r() * 6);
      }
    }
  }, { key: `wainscot|${base}|${seed}` });
}

/**
 * Tissu : une trame (lignes croisées) et un motif — 'plaid' (tartan doux), 'velvet' (côtes de velours), 'knit'
 * (mailles de tricot) — dans les couleurs données.
 */
export function fabricTexture(kind = 'plaid', colors = ['#7d93a8', '#5d7186', '#e8dcc4'], seed = 6) {
  const S = 256;
  const [a, b, cc] = colors.map(css);
  return canvasTex(S, S, (c) => {
    const r = rng(seed);
    c.fillStyle = a;
    c.fillRect(0, 0, S, S);
    if (kind === 'plaid') {
      for (const [col, alpha, step, wid] of [[b, 0.55, 64, 22], [cc, 0.35, 64, 5], [b, 0.3, 32, 6]]) {
        c.fillStyle = col;
        c.globalAlpha = alpha;
        for (let x = 0; x < S; x += step) c.fillRect(x, 0, wid, S);
        for (let y = 0; y < S; y += step) c.fillRect(0, y, S, wid);
      }
      c.globalAlpha = 1;
    } else if (kind === 'velvet') {
      for (let x = 0; x < S; x += 8) {
        const g = c.createLinearGradient(x, 0, x + 8, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.18)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
        g.addColorStop(1, 'rgba(0,0,0,0.18)');
        c.fillStyle = g;
        c.fillRect(x, 0, 8, S);
      }
    } else {
      for (let y = 0; y < S; y += 8) {
        for (let x = 0; x < S; x += 8) {
          c.fillStyle = (Math.floor(y / 32) % 2) ? b : a;
          c.beginPath();
          c.ellipse(x + 2, y + 4, 2.5, 4.2, 0.5, 0, Math.PI * 2);
          c.ellipse(x + 6, y + 4, 2.5, 4.2, -0.5, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    // trame fine
    for (let i = 0; i < S; i += 2) {
      c.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.03})`;
      c.fillRect(0, i, S, 1);
      c.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.03})`;
      c.fillRect(i, 0, 1, S);
    }
  }, { key: `fabric|${kind}|${colors}|${seed}` });
}

/** Tapis tressé rond : anneaux de laine (crème, terre cuite, moutarde, vert de gris), torsades. UV : centre au milieu. */
export function braidedRugTexture(seed = 8) {
  const S = 512;
  return canvasTex(S, S, (c) => {
    const r = rng(seed);
    c.fillStyle = '#e6d8bc';
    c.fillRect(0, 0, S, S);
    const cols = ['#e6d8bc', '#d6c3a0', '#e6d8bc', '#c9a983', '#ddd0b4', '#a9b4ae', '#e6d8bc', '#cdb08c', '#d9c9aa', '#b98f6c'];
    const R = S / 2;
    const w = 9;
    for (let k = Math.floor(R / w); k >= 0; k--) {
      const rr = k * w + w;
      c.fillStyle = cols[k % cols.length];
      c.beginPath();
      c.arc(R, R, rr, 0, Math.PI * 2);
      c.fill();
      // torsades : petits traits obliques le long de l'anneau
      const n = Math.max(12, Math.floor(rr * 0.9));
      c.strokeStyle = 'rgba(60,35,20,0.16)';
      c.lineWidth = 1.2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x0 = R + Math.cos(a) * (rr - w * 0.85);
        const y0 = R + Math.sin(a) * (rr - w * 0.85);
        const x1 = R + Math.cos(a + 0.6 / Math.max(1, rr / 30)) * (rr - w * 0.1);
        const y1 = R + Math.sin(a + 0.6 / Math.max(1, rr / 30)) * (rr - w * 0.1);
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x1, y1);
        c.stroke();
      }
      c.strokeStyle = 'rgba(50,30,15,0.18)';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(R, R, rr, 0, Math.PI * 2);
      c.stroke();
    }
    for (let i = 0; i < 6000; i++) {
      c.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.06})` : `rgba(255,255,255,${r() * 0.07})`;
      c.fillRect(r() * S, r() * S, 1.5, 1.5);
    }
  }, { key: `rug|${seed}`, repeat: false });
}

/** Terre cuite : un orangé chaud, des marbrures, un peu de blanc (calcaire) par endroits. */
export function terracottaTexture(seed = 5) {
  const S = 128;
  return canvasTex(S, S, (c) => {
    const r = rng(seed);
    c.fillStyle = '#b8643c';
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 2500; i++) {
      const v = r();
      c.fillStyle = v < 0.4 ? `rgba(90,40,20,${r() * 0.12})` : v < 0.8 ? `rgba(230,140,90,${r() * 0.12})` : `rgba(240,230,210,${r() * 0.1})`;
      c.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 3);
    }
  }, { key: `terracotta|${seed}` });
}

/**
 * Feuille de plante d'intérieur (carte transparente) : 'monstera' (grande feuille découpée, fentes), 'round'
 * (feuille ronde de pilea), 'long' (feuille allongée de ficus). La nervure au milieu, plus claire.
 */
export function leafTexture(kind = 'monstera', seed = 7) {
  const S = 256;
  return canvasTex(S, S, (c) => {
    const r = rng(seed);
    c.clearRect(0, 0, S, S);
    c.save();
    c.translate(S / 2, S);
    const g = c.createLinearGradient(-S / 2, 0, S / 2, 0);
    g.addColorStop(0, '#2f6b33');
    g.addColorStop(0.5, '#4f9a4a');
    g.addColorStop(1, '#2c6430');
    c.fillStyle = g;
    c.beginPath();
    if (kind === 'round') c.ellipse(0, -S * 0.5, S * 0.42, S * 0.45, 0, 0, Math.PI * 2);
    else if (kind === 'long') c.ellipse(0, -S * 0.5, S * 0.2, S * 0.48, 0, 0, Math.PI * 2);
    else {
      c.moveTo(0, -S * 0.04);
      c.bezierCurveTo(-S * 0.62, -S * 0.25, -S * 0.5, -S * 0.95, 0, -S * 0.97);
      c.bezierCurveTo(S * 0.5, -S * 0.95, S * 0.62, -S * 0.25, 0, -S * 0.04);
    }
    c.fill();
    // fentes de la monstera : on efface des bandes depuis le bord
    if (kind === 'monstera') {
      c.globalCompositeOperation = 'destination-out';
      for (const s of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const y = -S * (0.25 + i * 0.17);
          c.lineWidth = 5 + r() * 3;
          c.beginPath();
          c.moveTo(s * S * 0.08, y + 6);
          c.quadraticCurveTo(s * S * 0.25, y - 4, s * S * 0.6, y - 20 - i * 6);
          c.stroke();
        }
      }
      c.globalCompositeOperation = 'source-over';
    }
    // nervures
    c.strokeStyle = 'rgba(190,230,150,0.75)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(0, -S * 0.95);
    c.stroke();
    c.strokeStyle = 'rgba(170,215,140,0.35)';
    c.lineWidth = 1.5;
    for (let i = 1; i < 7; i++) {
      const y = -S * (0.12 + i * 0.12);
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(0, y + 10);
        c.quadraticCurveTo(s * S * 0.12, y, s * S * 0.32, y - 14);
        c.stroke();
      }
    }
    // reflets
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.beginPath();
    c.ellipse(-S * 0.1, -S * 0.6, S * 0.08, S * 0.25, 0.3, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }, { key: `leaf|${kind}|${seed}`, repeat: false });
}

/** Le jardin derrière la porte-fenêtre : ciel clair, haie, massif fleuri, pelouse, un peu flou, très lumineux. */
export function gardenTexture(seed = 9) {
  const W = 256;
  const H = 512;
  return canvasTex(W, H, (c) => {
    const r = rng(seed);
    const sky = c.createLinearGradient(0, 0, 0, H * 0.55);
    sky.addColorStop(0, '#d9ecf7');
    sky.addColorStop(1, '#fff6e2');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    // arbres au loin
    for (let i = 0; i < 9; i++) {
      c.fillStyle = `rgba(${110 + r() * 40},${150 + r() * 30},${100 + r() * 30},0.55)`;
      c.beginPath();
      c.ellipse(r() * W, H * (0.38 + r() * 0.08), 30 + r() * 40, 40 + r() * 30, 0, 0, Math.PI * 2);
      c.fill();
    }
    // haie
    c.fillStyle = '#6f9a5a';
    c.fillRect(0, H * 0.48, W, H * 0.12);
    for (let i = 0; i < 60; i++) {
      c.fillStyle = `rgba(${80 + r() * 50},${120 + r() * 50},${60 + r() * 30},0.7)`;
      c.beginPath();
      c.arc(r() * W, H * (0.48 + r() * 0.1), 6 + r() * 12, 0, Math.PI * 2);
      c.fill();
    }
    // pelouse
    const lawn = c.createLinearGradient(0, H * 0.6, 0, H);
    lawn.addColorStop(0, '#a8cf74');
    lawn.addColorStop(1, '#8dbb5e');
    c.fillStyle = lawn;
    c.fillRect(0, H * 0.6, W, H * 0.4);
    // fleurs
    for (let i = 0; i < 70; i++) {
      c.fillStyle = ['#f4c2c2', '#fff2a8', '#ffffff', '#e8a0c8', '#f3a65a'][Math.floor(r() * 5)];
      c.beginPath();
      c.arc(r() * W, H * (0.58 + r() * 0.08), 2 + r() * 3, 0, Math.PI * 2);
      c.fill();
    }
    // lumière qui baigne tout
    c.fillStyle = 'rgba(255,248,230,0.25)';
    c.fillRect(0, 0, W, H);
  }, { key: `garden|${seed}`, repeat: false });
}

/**
 * Céramique émaillée d'une gamelle : une couleur, une bande, le prénom de l'animal et une patte (dessus du bord
 * extérieur). U : le tour de la gamelle ; V : de bas en haut.
 */
export function bowlTexture(color = '#d9574a', name = '', band = '#fff4e2') {
  const W = 512;
  const H = 128;
  return canvasTex(W, H, (c) => {
    c.fillStyle = css(color);
    c.fillRect(0, 0, W, H);
    // émail : plus clair en haut, coulures
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0.12)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.fillStyle = band;
    c.fillRect(0, H * 0.12, W, 6);
    c.fillRect(0, H * 0.84, W, 4);
    c.fillStyle = band;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = 'bold 44px "Trebuchet MS", system-ui, sans-serif';
    const text = String(name || '').slice(0, 12);
    // le prénom deux fois (on en voit toujours un), une patte entre les deux
    for (const x of [W * 0.25, W * 0.75]) c.fillText(text, x, H * 0.5);
    for (const x of [0, W * 0.5]) paw(c, x, H * 0.5, 14, band);
  }, { key: `bowl|${color}|${name}|${band}` });
}

/** Une empreinte de patte (coussinet et quatre doigts). */
export function paw(c, x, y, s, color) {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y + s * 0.35, s * 0.55, s * 0.45, 0, 0, Math.PI * 2);
  c.fill();
  for (const [dx, dy] of [[-0.62, -0.25], [-0.22, -0.62], [0.22, -0.62], [0.62, -0.25]]) {
    c.beginPath();
    c.ellipse(x + dx * s, y + dy * s, s * 0.2, s * 0.26, dx * 0.4, 0, Math.PI * 2);
    c.fill();
  }
}

/** Sac de croquettes (ou de granulés) : papier kraft, étiquette ronde avec une patte, une bande de couleur. */
export function bagTexture(kind = 'dog') {
  const W = 256;
  const H = 256;
  const col = { dog: '#c8463c', cat: '#4a7fc0', rabbit: '#4f9a4a' }[kind] ?? '#c8463c';
  return canvasTex(W, H, (c) => {
    const r = rng(11);
    c.fillStyle = '#d8b884';
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 3000; i++) {
      c.fillStyle = r() < 0.5 ? `rgba(90,60,25,${r() * 0.08})` : `rgba(255,240,210,${r() * 0.08})`;
      c.fillRect(r() * W, r() * H, 1, 2 + r() * 4);
    }
    c.fillStyle = col;
    c.fillRect(0, H * 0.7, W, H * 0.12);
    c.fillStyle = '#fff6e6';
    c.beginPath();
    c.arc(W / 2, H * 0.42, 52, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = col;
    c.lineWidth = 6;
    c.stroke();
    paw(c, W / 2, H * 0.43, 30, col);
  }, { key: `bag|${kind}` });
}

/** Grillage soudé (mailles carrées, fil galvanisé), transparent entre les fils. */
export function wireMeshTexture() {
  const S = 128;
  return canvasTex(S, S, (c) => {
    c.clearRect(0, 0, S, S);
    const n = 4;
    const step = S / n;
    for (const [col, w] of [['rgba(60,64,66,0.9)', 4], ['rgba(200,206,210,1)', 2.2], ['rgba(255,255,255,0.7)', 0.8]]) {
      c.strokeStyle = col;
      c.lineWidth = w;
      for (let i = 0; i <= n; i++) {
        c.beginPath();
        c.moveTo(i * step, 0);
        c.lineTo(i * step, S);
        c.stroke();
        c.beginPath();
        c.moveTo(0, i * step);
        c.lineTo(S, i * step);
        c.stroke();
      }
    }
  }, { key: 'wiremesh' });
}

/** Une tache de soleil sur le sol (la porte-fenêtre et ses croisillons, bords doux), pour un plan additif. */
export function sunPatchTexture(cols = 2, rows = 3) {
  const W = 256;
  const H = 384;
  return canvasTex(W, H, (c) => {
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);
    c.filter = 'blur(6px)';
    c.fillStyle = '#fff';
    const m = 20;
    const bar = 8;
    const cw = (W - 2 * m - (cols - 1) * bar) / cols;
    const ch = (H - 2 * m - (rows - 1) * bar) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) c.fillRect(m + i * (cw + bar), m + j * (ch + bar), cw, ch);
    c.filter = 'none';
  }, { key: `sunpatch|${cols}|${rows}`, repeat: false, srgb: false });
}


/**
 * Saleté dans le poil, à brosser : des mottes de terre séchée et des poils collés, allongées dans le sens du poil,
 * bords qui s'effacent. light : poussière claire (gris beige) pour un poil foncé ; sinon terre sombre (brun gris),
 * qui se voit sur un poil roux, fauve, blanc ou tricolore. Transparente autour ; aussi bonne carte de relief.
 */
export function petDirtTexture(light = false, seed = 5) {
  const S = 128;
  return canvasTex(S, S, (c) => {
    const r = rng(seed);
    const base = light ? [214, 204, 184] : [78, 62, 48];
    const core = light ? [236, 230, 216] : [48, 36, 27];
    const fleck = light ? [250, 247, 238] : [150, 128, 100];
    const rgb = (k, j = 12) => k.map((v) => Math.max(0, Math.min(255, Math.round(v + (r() - 0.5) * j)))).join(',');
    const soft = (cx, cy, rx, ry, col, a) => {
      c.save();
      c.translate(cx, cy);
      c.scale(1, ry / rx);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(${col},${a})`);
      g.addColorStop(0.6, `rgba(${col},${a * 0.88})`);
      g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, rx, 0, Math.PI * 2);
      c.fill();
      c.restore();
    };
    // la tache : plusieurs mottes qui se chevauchent, allongées (le sens du poil est horizontal dans la texture)
    for (let i = 0; i < 12; i++) {
      const rx = 13 + r() * 20;
      soft(S / 2 + (r() - 0.5) * 56, S / 2 + (r() - 0.5) * 30, rx, rx * (0.45 + r() * 0.25), rgb(base), 0.95);
    }
    // cœurs plus marqués
    for (let i = 0; i < 9; i++) soft(S / 2 + (r() - 0.5) * 46, S / 2 + (r() - 0.5) * 24, 5 + r() * 8, 3 + r() * 4, rgb(core), 0.85);
    // poils collés en traînées, et éclats de croûte, seulement sur la tache
    c.save();
    c.globalCompositeOperation = 'source-atop';
    c.lineCap = 'round';
    for (let i = 0; i < 300; i++) {
      const px = r() * S;
      const py = r() * S;
      const a = (r() - 0.5) * 0.3;
      const l = 4 + r() * 9;
      c.strokeStyle = `rgba(${rgb(r() < 0.5 ? core : fleck, 30)},${0.35 + r() * 0.5})`;
      c.lineWidth = 0.8 + r();
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
      c.stroke();
    }
    for (let i = 0; i < 80; i++) {
      c.fillStyle = `rgba(${rgb(fleck, 24)},${0.5 + r() * 0.45})`;
      c.fillRect(r() * S, r() * S, 1.5 + r() * 2.5, 1 + r() * 1.5);
    }
    c.restore();
    // quelques projections autour
    for (let i = 0; i < 8; i++) {
      const a = r() * Math.PI * 2;
      const d = 40 + r() * 16;
      soft(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d * 0.6, 2 + r() * 3, 2 + r() * 2, rgb(core), 0.9);
    }
  }, { repeat: false, key: `petDirt|${light ? 1 : 0}|${seed}` });
}
