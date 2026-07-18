import type { Feature, FeatureContext } from './feature.ts';
import type { EventBus } from './events.ts';
import { loadFeatureData, saveFeatureData } from './save.ts';

/**
 * ゲーム内の「日数」の時計(基盤機能)。
 * 太陽がプレイヤー地点で昇った回数(sunElevationが負→正に変わった回数)を
 * 日付として数え、'day-passed' を発火する。
 * 薬草の再生・畑の成長・掲示板の張り替えなどがこの時計を使う。
 */

const VERSION = 1;

let day = 1;
let lastElevation: number | null = null;

/** いまのゲーム内日付(1始まり)。他の機能から参照してよい */
export function currentDay(): number {
  return day;
}

/**
 * 留守にしていた実時間ぶん、日付をまとめて進める(idle機能が起動時に呼ぶ)。
 * 1日ずつ day-passed を発火するので、薬草の再生や畑の成長が正しく積み重なる
 */
export function advanceOfflineDays(days: number, events: EventBus): void {
  for (let i = 0; i < days; i++) {
    day++;
    events.emit('day-passed', { day });
  }
  saveFeatureData('clock', VERSION, { day });
}

export const clockFeature: Feature = {
  id: 'clock',
  setup(): void {
    const saved = loadFeatureData<{ day: number }>('clock', VERSION);
    day = saved?.day ?? 1;
    lastElevation = null;
  },
  update(_deltaTime: number, ctx: FeatureContext): void {
    const elevation = ctx.sunElevation();
    if (lastElevation !== null && lastElevation < 0 && elevation >= 0) {
      day++;
      saveFeatureData('clock', VERSION, { day });
      ctx.events.emit('day-passed', { day });
    }
    lastElevation = elevation;
  },
};
