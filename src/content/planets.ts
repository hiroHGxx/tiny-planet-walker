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
  /** 木のかたち。'palm'=ヤシ風(なぎさの星) */
  treeStyle?: 'default' | 'palm';
  /** 舞いつづける粒(春=花びら、秋=落ち葉、冬=小雪)。天気に関係なく常時 */
  drift?: { color: number };
  /** trueで浜辺の波音を流す(なぎさの星) */
  waves?: boolean;
  /** 昼のBGMメロディ(audio.tsのMELODIES参照。music機能が昼にこれへ切り替える) */
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
 * 四季の星めぐり(設計書§7)。
 * 2=春・3=夏は新規、4=秋(旧こもれびの星)・5=冬(旧しんじゅの星)は改装。
 * ※ need は現在デバッグ用に低め(5/8/10/12)。デバッグ後に§7の表(5/15/30/50)へ
 */
export const PLANET_DEFS: Readonly<Record<number, PlanetDef>> = {
  1: {
    name: '薬草の星',
    need: 0,
    herbs: [...BASE, 'kogane', 'suzufuri'], // 基本+こがね穂・すずふり草
  },
  2: {
    name: 'はるかぜの星',
    need: 5,
    herbs: [...BASE, 'sakura', 'wakaba'], // 春:さくら草・わかば草の故郷
    theme: {
      grassShift: { h: 0.01, s: 0.05, l: 0.05 }, // 若草色
      foliage: [0xf2b3ce, 0xf7c9dd, 0xe897bd], // 桜(桃色の葉玉)
      sky: { dawn: 0xdc98a8 }, // 明け方が桜色に染まる
      weather: { sunny: 0.5, cloudy: 0.27, rain: 0.13, fog: 0.1 },
      drift: { color: 0xf7c9dd }, // 花びらの舞
      melody: 'spring',
    },
  },
  3: {
    name: 'なぎさの星',
    need: 8,
    herbs: [...BASE, 'shiokaze', 'himawari'], // 夏:しおかぜ草・ひまわり草の故郷
    theme: {
      grassShift: { h: -0.01, s: 0.08, l: 0.02 }, // 日ざしの濃い緑
      foliage: [0x4fae62, 0x67c377, 0x3f9a55],
      treeStyle: 'palm', // ヤシ風の木
      sky: { dawn: 0xe8a95f }, // 強い日ざしの朝焼け
      water: 0x4fb3d9, // 南の海の明るい青
      sand: 0xe8d9a4,
      weather: { sunny: 0.65, cloudy: 0.2, rain: 0.08, fog: 0.07 }, // 晴れ多め
      waves: true, // 波音
      melody: 'summer',
    },
    layout: {
      // 星の裏側に大きな海と広い砂浜(固定ランドマークから最も遠い方向を計算済み)
      lakes: [
        {
          direction: new THREE.Vector3(0.47, -0.832, -0.296).normalize(),
          radius: 11,
          beach: 1.45,
        },
      ],
    },
  },
  4: {
    name: 'もみじの星',
    need: 10,
    // 秋:もみじ茸・くりの実の故郷。あかね草はこの星の生まれ(旧こもれび)。
    // 月しろ草はヒナさんの依頼で使うため秋にも残す(冬と両方に生える)
    herbs: [...BASE, 'akane', 'tsukishiro', 'momijitake', 'kuri'],
    theme: {
      grassShift: { h: -0.09, s: 0.02, l: 0.015 }, // 秋の琥珀寄り(旧こもれびを引き継ぐ)
      foliage: [0xc75b4a, 0xd8853f, 0xb06a38], // 紅葉
      sky: { dawn: 0xd0784a }, // 夕焼けの深い橙
      weather: { sunny: 0.42, cloudy: 0.3, rain: 0.18, fog: 0.1 },
      drift: { color: 0xd0763f }, // 落ち葉の舞
      melody: 'autumn',
    },
  },
  5: {
    name: 'こなゆきの星',
    need: 12,
    // 冬:ゆきわり草・こおり花の故郷。むらさき茸と月しろ草もここに(旧しんじゅ)
    herbs: [...BASE, 'tsukishiro', 'murakinoko', 'yukiwari', 'koori'],
    theme: {
      grassShift: { h: 0.05, s: -0.38, l: 0.3 }, // 雪の白い草地
      foliage: [0xdce8e0, 0xbcd0c4, 0x9cb8ab], // 雪をかぶった木
      sky: { base: 0x16203a, night: 0x0e1626, mid: 0x283c5e, dawn: 0xc8d4dc }, // 冬の冷たい空
      water: 0xa8cbdd, // 氷のような湖
      sand: 0xeef2f5, // 雪の岸辺
      snow: true, // 降りものは雪
      weather: { sunny: 0.3, cloudy: 0.3, rain: 0.3, fog: 0.1 }, // 雪の日が多い
      drift: { color: 0xffffff }, // 常時ちらつく小雪
      melody: 'winter',
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
