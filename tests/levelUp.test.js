// Passage de niveau : annoncé un instant après l'achat, jamais en grande fenêtre par-dessus un panneau ouvert.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UI, LEVEL_UP_DELAY } from '../src/ui/UI.js';

/** Fausse interface : seulement ce que levelUp et flushLevelUps utilisent. */
function fakeUi({ panel = null, modalOpen = false, activity = null } = {}) {
  const shown = [];
  const ui = {
    panel, modalOpen,
    game: { running: true, activities: { active: activity } },
    toast: (msg) => shown.push(['toast', msg]),
    alert: (msg) => shown.push(['alert', msg]),
  };
  ui.levelUp = UI.prototype.levelUp.bind(ui);
  ui.flushLevelUps = UI.prototype.flushLevelUps.bind(ui);
  return { ui, shown };
}

describe('passage de niveau (UI.levelUp)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pas tout de suite : on voit d\'abord l\'achat, la fenêtre vient après LEVEL_UP_DELAY', () => {
    const { ui, shown } = fakeUi();
    ui.levelUp(2, 'Niche');
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(LEVEL_UP_DELAY - 1);
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(shown.length).toBe(1);
    expect(shown[0][0]).toBe('alert');
    expect(shown[0][1]).toMatch(/2/);
  });

  it('retourné à l\'animalerie entre-temps (panneau ouvert) : une bulle, pas une fenêtre par-dessus', () => {
    const { ui, shown } = fakeUi();
    ui.levelUp(2, 'Niche');
    ui.panel = { title: '🛒 Animalerie' };
    vi.advanceTimersByTime(LEVEL_UP_DELAY);
    expect(shown.map((s) => s[0])).toEqual(['toast']);
  });

  it('fenêtre ouverte ou activité en cours : en bulle aussi', () => {
    for (const opts of [{ modalOpen: true }, { activity: { kind: 'course' } }]) {
      const { ui, shown } = fakeUi(opts);
      ui.levelUp(3, '');
      vi.advanceTimersByTime(LEVEL_UP_DELAY);
      expect(shown.map((s) => s[0])).toEqual(['toast']);
    }
  });

  it('deux niveaux d\'un coup : les deux sont annoncés, dans l\'ordre', () => {
    const { ui, shown } = fakeUi();
    ui.levelUp(2, 'Niche');
    ui.levelUp(3, 'Abri');
    vi.advanceTimersByTime(LEVEL_UP_DELAY);
    expect(shown.length).toBe(2);
    expect(shown[0][1]).toMatch(/2/);
    expect(shown[1][1]).toMatch(/3/);
  });

  it('partie quittée avant l\'annonce : rien ne s\'affiche sur l\'écran d\'accueil', () => {
    const { ui, shown } = fakeUi();
    ui.levelUp(2, 'Niche');
    ui.game.running = false;
    vi.advanceTimersByTime(LEVEL_UP_DELAY);
    expect(shown).toEqual([]);
  });
});
