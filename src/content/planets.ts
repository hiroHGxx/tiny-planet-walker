import * as THREE from 'three';

/**
 * 星の台帳(1星=1エントリ)。
 * 名前・気球のしきい値・生える薬草・テーマ(色や天気の性格)・
 * レイアウト上書きをここに集約する。星を増やすときはここに足すだけでよい。
 * (worldの群生地・掲示板・気球のパネル・palette がここを参照する)
 */

export interface PlanetTheme {
  /** 草地の色相シフト(既存の setPlanetTheme の仕組み) */
  grassShift?: { h: number; s: number; l: number };
  /** 木の葉色の差し替え(桜=桃色、紅葉=赤茶など)。省略時は共通の緑 */
  foliage?: ReadonlyArray<number>;
  /** 空の色味の差し替え(シェーダーのグラデ3色+背景色) */
  sky?: { base?: number; night?: number; mid?: number; dawn?: number };
  /** 湖の水と砂の色 */
  water?: number;
  sand?: number;
  /**
   * 天気の出やすさの重み(正規化不要)。省略時は共通デフォルト。
   * 夜は雨の重みが自動で下がる(星空を大事にする既存方針)
   */
  weather?: { sunny: number; cloudy: number; rain: number; fog: number };
  /** trueで降りものが雪になる(白く・ゆっくり・音は控えめ) */
  snow?: boolean;
  /** BGMモード(予約。§7の四季メロディはphase3でaudio.tsに実装する) */
  melody?: 'spring' | 'summer' | 'autumn' | 'winter';
}

export interface PlanetLayout {
  /**
   * 湖の上書き。指定した星は共通レイアウトの湖の代わりにこれを使う
   * (方向は絶対値。LAYOUT_ROTATIONは掛からないので星ごとに直接決める)。
   * beach は砂浜の広さの倍率(省略時1.18=いまの縁の細さ)。
   * ※最低1つは必要(桟橋・釣り場・村人の家が「1つ目の湖」を基準に決まるため)
   */
  lakes?: ReadonlyArray<{ direction: THREE.Vector3; radius: number; beach?: number }>;
}

export interface PlanetDef {
  name: string;
  /** 気球で行くのに必要な星あかり(✨) */
  need: number;
  /** この星に生える薬草(items.tsのID) */
  herbs: ReadonlyArray<string>;
  theme?: PlanetTheme;
  layout?: PlanetLayout;
}

const BASE = [
  'roundleaf',
  'starflower',
  'glow',
  'berry',
  'smallflower',
  'rosette',
  'bud',
];

/**
 * ※ need は現在デバッグ用に低め(5/10)。四季実装時は§7の表(5/15/30/50)にする
 */
export const PLANET_DEFS: Readonly<Record<number, PlanetDef>> = {
  1: {
    name: '薬草の星',
    need: 0,
    herbs: [...BASE, 'kogane', 'suzufuri'], // 基本+こがね穂・すずふり草
  },
  2: {
    name: 'こもれびの星',
    need: 5,
    herbs: [...BASE, 'kogane', 'akane', 'tsukishiro'], // あかね草と月しろ草の故郷
    theme: {
      grassShift: { h: -0.09, s: 0.02, l: 0.015 }, // 秋の琥珀寄り
    },
  },
  3: {
    name: 'しんじゅの星',
    need: 10,
    herbs: [...BASE, 'suzufuri', 'tsukishiro', 'murakinoko'], // むらさき茸の故郷
    theme: {
      grassShift: { h: 0.05, s: -0.2, l: 0.09 }, // 淡く白っぽく
    },
  },
};

/** 星番号(1始まり)から定義を引く。未知の番号は星1の定義に落とす */
export function planetDef(planet: number): PlanetDef {
  return PLANET_DEFS[planet] ?? PLANET_DEFS[1]!;
}

/** 星番号の昇順リスト(気球のパネルが使う) */
export const PLANET_NUMBERS: ReadonlyArray<number> = Object.keys(PLANET_DEFS)
  .map(Number)
  .sort((a, b) => a - b);

/** 星→薬草の対応(後方互換。world と掲示板が参照) */
export const PLANET_HERBS: Readonly<Record<number, ReadonlyArray<string>>> =
  Object.fromEntries(
    Object.entries(PLANET_DEFS).map(([n, def]) => [n, def.herbs])
  );
