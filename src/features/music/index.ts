import type { Feature, FeatureContext } from '../feature.ts';

/**
 * 音の拡張(F3)。
 * - 昼夜でBGMのメロディを切り替える(夜は短調・ゆっくり。audio.tsが持つ)
 * - 出来事に小さなジングルを添える(図鑑の発見、摘んだとき)
 * AudioContextはaudio.tsが1つだけ持ち、この機能は指示を出すだけ。
 */

/** 昼夜の切り替えのしきい値(行き来でチラつかないようヒステリシスを持つ) */
const DAY_THRESHOLD = 0.05;
const NIGHT_THRESHOLD = -0.05;

let mode: 'day' | 'night' = 'day';

export const musicFeature: Feature = {
  id: 'music',
  setup(ctx: FeatureContext): void {
    ctx.events.on('herb-discovered', () => ctx.audio.playJingle('discover'));
    ctx.events.on('item-picked', () => ctx.audio.playJingle('pick'));
    ctx.events.on('quest-completed', () => ctx.audio.playJingle('quest'));
    ctx.events.on('craft-done', () => ctx.audio.playJingle('craft'));
  },
  update(_deltaTime: number, ctx: FeatureContext): void {
    const elevation = ctx.sunElevation();
    if (mode === 'day' && elevation < NIGHT_THRESHOLD) {
      mode = 'night';
      ctx.audio.setMelodyMode('night');
    } else if (mode === 'night' && elevation > DAY_THRESHOLD) {
      mode = 'day';
      ctx.audio.setMelodyMode('day');
    }
  },
};
