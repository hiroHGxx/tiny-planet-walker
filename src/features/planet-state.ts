import { loadFeatureData, saveFeatureData } from './save.ts';

/**
 * いまいる星の番号(基盤)。1が最初の「薬草の星」。
 * 星の移動はページ再読み込みで行う(world一式を作り直す最も安全な方法)ため、
 * この値は起動時に一度だけ読む。garden や pouch の「星ごとのセーブ」の
 * キー名にも使う。
 */

const saved = loadFeatureData<{ planet: number }>('planet', 1);
const planet = Math.max(1, saved?.planet ?? 1);

export function currentPlanet(): number {
  return planet;
}

/** 次に開く星を保存する(呼んだあと location.reload() すること) */
export function setPlanet(next: number): void {
  saveFeatureData('planet', 1, { planet: Math.max(1, next) });
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
