import { loadFeatureData, saveFeatureData } from './save.ts';
import { PLANET_NUMBERS } from '../content/planets.ts';

/**
 * いまいる星の番号(基盤)。1が最初の「薬草の星」。
 * 星の移動はページ再読み込みで行う(world一式を作り直す最も安全な方法)ため、
 * この値は起動時に一度だけ読む。garden や pouch の「星ごとのセーブ」の
 * キー名にも使う。
 */

/** 台帳にある星番号だけを受け付ける(壊れたセーブや未知の番号は星1へ) */
function sanitize(value: unknown): number {
  return typeof value === 'number' && PLANET_NUMBERS.includes(value) ? value : 1;
}

const saved = loadFeatureData<{ planet: number }>('planet', 1);
const planet = sanitize(saved?.planet);

export function currentPlanet(): number {
  return planet;
}

/** 次に開く星を保存する(呼んだあと location.reload() すること) */
export function setPlanet(next: number): void {
  saveFeatureData('planet', 1, { planet: sanitize(next) });
}

const ARRIVING_KEY = 'tiny-planet-walker:arriving';
let arrivingCache: boolean | null = null;

/** 旅立つ直前に呼ぶ(reload後の到着演出用の一回きりの旗) */
export function markTraveling(): void {
  try {
    sessionStorage.setItem(ARRIVING_KEY, '1');
  } catch {
    // 保存できない環境では通常のタイトル画面になるだけ
  }
}

/** 気球での到着直後か(最初の呼び出しで旗を消費し、以後は同じ答えを返す) */
export function isArriving(): boolean {
  if (arrivingCache !== null) return arrivingCache;
  try {
    arrivingCache = sessionStorage.getItem(ARRIVING_KEY) === '1';
    sessionStorage.removeItem(ARRIVING_KEY);
  } catch {
    arrivingCache = false;
  }
  return arrivingCache;
}
