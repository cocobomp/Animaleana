// 🤚 Textes de « Bravo ! » / « Rassure-le » en selle (src/sim/praise.js, src/game/Game.js praiseHorse) et de sa peur qui
// s'en va (src/sim/horseQuirks.js calmFear). Branchés dans src/i18n.js par Object.assign.

export const PRAISE_FR = {
  pr_btn: 'Bravo !',
  pr_btnCalm: 'Rassure-le',
  pr_btnCalm_f: 'Rassure-la',
  pr_btnHelp: 'Gratte-lui le garrot (ou Espace)',
  pr_tip: '🤚 Il adore les gratouilles au garrot : les chevaux se grattent là entre eux.',
  pr_tip_f: '🤚 Elle adore les gratouilles au garrot : les chevaux se grattent là entre eux.',
  pr_fav: '💖 Son coin préféré !',
  pr_calm: '💚 Tu le rassures : il se calme.',
  pr_calm_f: '💚 Tu la rassures : elle se calme.',
  pr_fearStep: '💪 {name} a moins peur {what} ({n}/{total})',
  pr_fearGone: '💪 {name} n\'a plus peur {what} !',
  qk_fearGone: '💪 Il n\'a plus peur {what}',
  qk_fearGone_f: '💪 Elle n\'a plus peur {what}',
  mem_fearGone: 'Sa peur s\'est envolée',
  lb_praises: 'Bravos en selle',
};

export const PRAISE_EN = {
  pr_btn: 'Well done!',
  pr_btnCalm: 'Calm them',
  pr_btnHelp: 'Scratch their withers (or Space)',
  pr_tip: '🤚 They love a scratch on the withers: horses scratch each other there.',
  pr_fav: '💖 Their favourite spot!',
  pr_calm: '💚 You reassure them: they calm down.',
  pr_fearStep: '💪 {name} is less scared of {what} ({n}/{total})',
  pr_fearGone: '💪 {name} is no longer scared of {what}!',
  qk_fearGone: '💪 No longer scared of {what}',
  mem_fearGone: 'Their fear flew away',
  lb_praises: 'Well-dones in the saddle',
};
