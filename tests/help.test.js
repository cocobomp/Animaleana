import { describe, it, expect } from 'vitest';
import { searchHelp } from '../src/ui/help.js';

describe('aide', () => {
  it('trouve la bonne fiche quand on tape une question', () => {
    expect(searchHelp('comment acheter une laisse ?')[0].id).toBe('leash');
    expect(searchHelp('mon cheval est malade')[0].id).toBe('vet');
    expect(searchHelp('avoir des bébés')[0].id).toBe('babies');
    expect(searchHelp('comment agrandir le paddock')[0].id).toBe('grow');
    expect(searchHelp('make the stable bigger')[0].id).toBe('grow');
    expect(searchHelp('').length).toBeGreaterThan(10);
  });
});
