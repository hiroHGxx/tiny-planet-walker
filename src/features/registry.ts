import type { Feature } from './feature.ts';
import { titleFeature } from './title/index.ts';
import { clockFeature } from './clock.ts';
import { interactFeature } from './interact/index.ts';
import { pouchFeature } from './pouch/index.ts';
import { musicFeature } from './music/index.ts';
import { questsFeature } from './quests/index.ts';
import { talkFeature } from './talk/index.ts';
import { homeFeature } from './home/index.ts';
import { weatherFeature } from './weather/index.ts';
import { scheduleFeature } from './schedule/index.ts';
import { animalsFeature } from './animals/index.ts';
import { lettersFeature } from './letters/index.ts';
import { boardFeature } from './board/index.ts';
import { gardenFeature } from './garden/index.ts';
import { idleFeature } from './idle/index.ts';
import { planetsFeature } from './planets/index.ts';

/**
 * 有効な機能の一覧。ここから1行消せば(importも消して)機能が丸ごと消える。
 * setup/updateは配列の順に呼ばれる。clock/interact/pouchは他機能の土台なので先頭側に置く。
 * 依存関係:talk→quests→pouch→interact(土台側は単独でも動く)
 */
export const FEATURES: Feature[] = [
  titleFeature,
  clockFeature,
  interactFeature,
  pouchFeature,
  musicFeature,
  questsFeature,
  talkFeature,
  homeFeature,
  weatherFeature,
  scheduleFeature,
  animalsFeature,
  lettersFeature,
  boardFeature,
  gardenFeature,
  idleFeature,
  planetsFeature,
];
