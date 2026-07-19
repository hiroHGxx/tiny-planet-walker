import { describe, expect, it } from 'vitest';
import { MELODIES } from './content/melodies.ts';
import { PLANET_DEFS } from './content/planets.ts';

describe('BGMメロディの台帳', () => {
  it('星の台帳が指すメロディはすべて定義されている', () => {
    for (const [n, def] of Object.entries(PLANET_DEFS)) {
      const melody = def.theme?.melody;
      if (melody) {
        expect(MELODIES[melody], `星${n}のmelody(${melody})`).toBeDefined();
      }
    }
  });

  it('各メロディの拍と音符がまともな範囲にある', () => {
    for (const [mode, { beat, notes }] of Object.entries(MELODIES)) {
      expect(beat, `${mode}のbeat`).toBeGreaterThan(0.2);
      expect(beat, `${mode}のbeat`).toBeLessThan(1);
      expect(notes.length, `${mode}の音数`).toBeGreaterThan(4);
      for (const [midi, beats] of notes) {
        // 0は休符。それ以外は無理のない音域(低いソ〜高いレ)に収める
        if (midi !== 0) {
          expect(midi, `${mode}のノート${midi}`).toBeGreaterThanOrEqual(55);
          expect(midi, `${mode}のノート${midi}`).toBeLessThanOrEqual(90);
        }
        expect(beats, `${mode}の拍数`).toBeGreaterThan(0);
      }
    }
  });
});
