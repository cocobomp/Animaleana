// Habiller un décor de soin déjà construit : le lieu du voyage (away.js), la lumière de l'heure et la météo
// (ambience.js), les objets du jour et le petit plus du lieu (extras.js). Servi par le décor de chaque soin
// (src/ui/minigames/care3d.js : decorFor) et par les jeux qui changent eux-mêmes de décor (la balle de la chèvre au pré,
// la longe au rond : goatPlay3d.js, lunge3d.js). Tout ce qui est ajouté est libéré avec le décor (decor.dispose).

import { applyAmbience } from './ambience.js';
import { placeExtras } from './extras.js';
import { dressAway } from './away.js';

/**
 * Habille le décor d (déjà construit, dans la scène stage) : amb (careAmbience), kinds (pickExtras), life (pickLife),
 * seed (graine du jour), look (la famille du lieu de voyage, ou null), anywhere (pas de caméra fixe : placeExtras).
 * Ajoute à d : ambience, extrasPicked, extras, ambienceParts, away ; et enrobe d.update et d.dispose. Renvoie d.
 */
export function dressDecor(stage, d, { amb = null, kinds = [], life = [], seed = 1, look = null, anywhere = false } = {}) {
  if (!amb) return d;
  let W = null;
  let A = null;
  let X = null;
  try {
    W = look ? dressAway(stage, d, look, amb) : null;
    A = applyAmbience(stage, d, amb);
    X = kinds.length || life.length ? placeExtras(stage, d, kinds, { seed, life, look, anywhere }) : null;
  } catch (e) {
    console.warn('[decor] ambiance ou objets impossibles', e?.message ?? e);
  }
  d.ambience = { time: amb.time, weather: amb.weather, season: amb.season, lamp: !!A?.lamp };
  d.extrasPicked = kinds;
  d.extras = X;
  d.ambienceParts = A;
  d.away = W;
  const update = d.update;
  const dispose = d.dispose;
  d.update = (dt, st) => {
    update.call(d, dt, st);
    W?.update(dt, st);
    A?.update(dt, st);
    X?.update(dt, st);
  };
  d.dispose = () => {
    X?.dispose();
    A?.dispose();
    W?.dispose();
    dispose.call(d);
  };
  return d;
}
