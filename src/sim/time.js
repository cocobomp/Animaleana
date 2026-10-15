// Le temps du jeu ne passe que pendant qu'on joue.
// 1 jour de jeu = 10 minutes réelles ; 1 an d'animal = 12 jours de jeu.

export const REAL_SECONDS_PER_GAME_DAY = 600;
export const GAME_MINUTES_PER_REAL_SECOND = (24 * 60) / REAL_SECONDS_PER_GAME_DAY;
export const DAYS_PER_YEAR = 12;

export const dayOf = (minutes) => Math.floor(minutes / 1440) + 1;
export const hourOf = (minutes) => (minutes % 1440) / 60;
export const isNight = (minutes) => {
  const h = hourOf(minutes);
  return h < 6.5 || h >= 21;
};

export function formatClock(minutes) {
  const total = Math.floor(minutes % 1440);
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function seasonOf(date = new Date()) {
  const m = date.getMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}
