import type { Feature, FeatureContext } from '../feature.ts';
import { namedNpcs } from '../talk/index.ts';

/**
 * 村人の生活リズム(F9)。
 * 夜になると村人は家の近くにとどまり、歩みもゆっくりになる
 * (窓の灯りと合わせて「そろそろおやすみ」の空気を作る)。
 * 朝になるといつもの散歩に戻る。名前つき村人(talk)も同じリズムに揃える。
 */

let night = false;

export const scheduleFeature: Feature = {
  id: 'schedule',
  setup(): void {
    night = false;
  },
  update(_deltaTime: number, ctx: FeatureContext): void {
    const isNight = ctx.sunElevation() < -0.05;
    if (isNight === night) return;
    night = isNight;
    for (const npc of ctx.world.npcs) npc.setNightCalm(night);
    for (const npc of namedNpcs()) npc.setNightCalm(night);
  },
};
