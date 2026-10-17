// Worker : prépare les coiffures des personnages (maillage des champs de distance, de 60 ms à plus
// d'une seconde chacune) hors du fil principal, pour que l'arrivée d'un visiteur ou d'une aide avec
// une nouvelle coiffure ne fige pas le jeu. Lancé par prepareHair (avatarHair.js).

import { hairArrays } from './avatarHair.js';

self.onmessage = (e) => {
  const { high, keys } = e.data;
  for (const [style, hat] of keys) {
    const r = hairArrays(style, hat, high);
    const transfer = [];
    for (const part of [r.main, r.tail]) {
      if (part) transfer.push(part.position.buffer, part.normal.buffer, part.index.buffer, part.groove.buffer);
    }
    self.postMessage(r, transfer);
  }
  self.postMessage({ done: true });
};
