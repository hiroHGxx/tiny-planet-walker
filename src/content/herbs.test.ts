import { describe, expect, it } from 'vitest';
import { HERBS, HERB_BY_ID } from './herbs.ts';
import { PLANET_HERBS } from './planets.ts';

describe('薬草の台帳', () => {
  it('idは重複せず、名前・説明・挿絵・工場がそろっている', () => {
    const ids = new Set<string>();
    for (const herb of HERBS) {
      expect(ids.has(herb.id), `${herb.id}が重複`).toBe(false);
      ids.add(herb.id);
      expect(herb.name.length).toBeGreaterThan(0);
      expect(herb.note.length).toBeGreaterThan(0);
      expect(herb.icon).toContain('<svg');
      expect(typeof herb.factory).toBe('function');
    }
  });

  it('星の台帳が指す薬草はすべて台帳にある', () => {
    for (const [planet, herbs] of Object.entries(PLANET_HERBS)) {
      for (const id of herbs) {
        expect(HERB_BY_ID.has(id), `星${planet}の${id}`).toBe(true);
      }
    }
  });
});
