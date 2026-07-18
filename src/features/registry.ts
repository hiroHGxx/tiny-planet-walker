import type { Feature } from './feature.ts';
import { titleFeature } from './title/index.ts';
import { clockFeature } from './clock.ts';
import { interactFeature } from './interact/index.ts';
import { pouchFeature } from './pouch/index.ts';
import { musicFeature } from './music/index.ts';

/**
 * 有効な機能の一覧。ここから1行消せば(importも消して)機能が丸ごと消える。
 * setup/updateは配列の順に呼ばれる。clock/interactは他機能の土台なので先頭側に置く。
 */
export const FEATURES: Feature[] = [
  titleFeature,
  clockFeature,
  interactFeature,
  pouchFeature,
  musicFeature,
];
