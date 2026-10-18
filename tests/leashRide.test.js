// Laisse et cheval : à cheval, jamais de laisse (elle traversait les barrières de la carrière) ; le chien
// suit librement, qu'il ait été en laisse avant de monter (Game.ride) ou qu'on la lui mette une fois en selle.
import { describe, it, expect, beforeAll } from 'vitest';

describe('pas de laisse à cheval', () => {
  let Game;
  beforeAll(async () => {
    ({ Game } = await import('../src/game/Game.js'));
  }, 60000);

  const dog = () => ({ id: 'd1', name: 'Rex', sex: 'm', species: 'dog', gear: { neck: { item: 'collar' }, leash: { item: 'leash' } } });
  const fakeGame = (mount) => {
    const toasts = [];
    return { toasts, player: { mount }, ui: { toast: (m) => toasts.push(m) } };
  };

  it('à pied : « Promener en laisse » met la laisse, puis l\'enlève', () => {
    const g = fakeGame(null);
    const a = dog();
    Game.prototype.toggleLeash.call(g, a);
    expect(a).toMatchObject({ following: true, leashed: true });
    Game.prototype.toggleLeash.call(g, a);
    expect(a).toMatchObject({ following: false, leashed: false });
  });

  it('à cheval : le chien suit sans laisse', () => {
    const g = fakeGame({ data: { name: 'Éclair' } });
    const a = dog();
    Game.prototype.toggleLeash.call(g, a);
    expect(a.following).toBe(true);
    expect(a.leashed).toBe(false);
    expect(g.toasts).toHaveLength(1);
  });

  it('sans collier ni laisse : rien ne change, même à cheval', () => {
    const g = fakeGame({ data: { name: 'Éclair' } });
    const a = { ...dog(), gear: {} };
    Game.prototype.toggleLeash.call(g, a);
    expect(a.following).toBeFalsy();
    expect(a.leashed).toBeFalsy();
  });
});
