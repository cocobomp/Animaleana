// ⭐ Textes de ses étoiles (src/sim/horseStars.js, src/game/Game.js starsTick, src/ui/panels.js starRow). Branchés dans
// src/i18n.js par Object.assign. Les noms des compétences : skill_<id>.

export const STARS_FR = {
  st_new: '⭐ {skill} : {name} a maintenant {n} étoiles !',
  st_new_one: '⭐ {skill} : {name} a sa première étoile !',
  st_unlock_noRefuse: 'Il ne pile plus devant les troncs.',
  st_unlock_noRefuse_f: 'Elle ne pile plus devant les troncs.',
  st_unlock_club: 'Le parcours du club s\'ouvre !',
  st_unlock_grand: 'Le grand parcours s\'ouvre !',
  st_next: '{icon} {skill} : encore {n} points pour l\'étoile suivante. {how}',
  st_next_one: '{icon} {skill} : encore 1 point pour l\'étoile suivante. {how}',
  st_max: '{icon} {skill} : toutes les étoiles !',
  st_how_jump: 'Saute des troncs, prends des leçons.',
  st_how_speed: 'Galope en balade.',
  st_how_endurance: 'Fais de longues balades.',
  st_how_dressage: 'Fais du dressage.',
  st_how_obedience: 'Longe et travail en liberté.',
  st_how_obedience_young: 'Un peu de travail en liberté, tout en douceur.',
};

export const STARS_EN = {
  st_new: '⭐ {skill}: {name} now has {n} stars!',
  st_new_one: '⭐ {skill}: {name} got a first star!',
  st_unlock_noRefuse: 'No more stopping at logs.',
  st_unlock_club: 'The club course is open!',
  st_unlock_grand: 'The big course is open!',
  st_next: '{icon} {skill}: {n} more points to the next star. {how}',
  st_next_one: '{icon} {skill}: 1 more point to the next star. {how}',
  st_max: '{icon} {skill}: all the stars!',
  st_how_jump: 'Jump logs, take lessons.',
  st_how_speed: 'Gallop on rides.',
  st_how_endurance: 'Go on long rides.',
  st_how_dressage: 'Do dressage.',
  st_how_obedience: 'Lunging and liberty work.',
  st_how_obedience_young: 'A little gentle liberty work.',
};
