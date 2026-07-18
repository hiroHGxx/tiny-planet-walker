import * as THREE from 'three';
import { planetDef } from './content/planets.ts';

/** 惑星の半径(ワールド原点が惑星の中心) */
export const PLANET_RADIUS = 25;

/**
 * 薬草星のカラーパレット。
 * 世界観の配色はすべてここにまとめ、後から一括で調整できるようにする。
 * 基調:緑・黄緑・生成り・茶色・薄い黄色/アクセント:紫・赤
 */
export const PALETTE = {
  // 空(明け方の濃い青紫)と星
  sky: 0x1b1533,
  skyNight: 0x120e26, // 空の夜側(太陽の反対側)
  skyMid: 0x2c1f52, // 空の中間色
  skyDawn: 0xcf8f6b, // 太陽側の明け方の暖色
  starWarm: 0xfff3d6,
  starCool: 0xcfdcff,
  smoke: 0xc7c0d6, // 煙突の煙

  // 惑星の草地。真ん中の色ほど広い面積になる
  grass: [0x4f8449, 0x619e53, 0x74b160, 0x8ac26e],

  // 植物
  stem: 0x4c7a3d, // 茎
  leaf: 0x79ad63, // 明るい葉
  leafDark: 0x54793f, // 暗い葉
  petal: 0xf5efd7, // 生成りの花びら
  flowerCenter: 0xe8c94f, // 花の中心(薄い黄色)
  glowBerry: 0xd9ef7c, // 光って見える実(明るい黄緑)
  glowEmissive: 0x55631c, // 実にほんのり足す自己発光色
  accentPurple: 0x9a6fb8, // アクセントの紫(キノコなど)
  accentRed: 0xc75b4a, // アクセントの赤

  // 木(絵本らしい明るめの緑)
  trunk: 0x8a6242,
  foliage: [0x5da457, 0x74b164, 0x4f9350],

  // 薬屋と小物
  wall: 0xefe6cf, // 生成りの壁
  roof: 0x7a5236, // 茶色の屋根
  door: 0x6d4a2f,
  windowGlow: 0xffe9a8, // 灯りのともった窓
  windowEmissive: 0x8a6d2f,
  wood: 0xa1794f, // 木箱・棚・看板
  pot: 0xb08968, // 植木鉢
  rock: 0x99958a,
  lantern: 0xffc86e,
  lanternEmissive: 0xa06a20,

  // 町(道・湖・丘)
  brick: 0xb0705a, // レンガ道の基本色
  brickLight: 0xc08064, // レンガの明るい色
  brickDark: 0x9a614d, // レンガの暗い色
  sand: 0xdfd0a2, // 湖の砂の縁
  water: 0x74aec9, // 湖の水面
  soil: 0x9a7550, // 畑の土

  // 照明
  hemiSky: 0x8f86c9,
  hemiGround: 0x4a6b45,
  sun: 0xffd9a8,
  fill: 0x8a9bd6,
  ambient: 0x8888a8,

  // キャラクター(薬屋の女の子:積み木人形調)
  skin: 0xf0cfa4, // 肌
  eye: 0x40342b, // 目
  boots: 0x6d4a2f, // 履物(濃い茶)
  hair: 0xb2d174, // 黄緑のボブヘア・猫耳・尻尾(シート寄りの明るい黄緑)
  hairLight: 0xc6dd8c, // 髪の明るい房(単調さを抑えるアクセント)
  earInner: 0xf2cdc5, // 猫耳の内側の淡いピンク
  kimono: 0x6fae5f, // 緑の着物
  haori: 0xd0763f, // オレンジの羽織
  socks: 0x3a3129, // 黒い長い靴下
  glasses: 0x2e2823, // 黒い丸眼鏡

  // 環境演出
  cloud: 0xf4f0e4, // 雲
  meteor: 0xfff6e0, // 流れ星
  butterflyWing: 0xe6d8f2, // 蝶の羽(薄紫)
  outline: 0x241a2e, // 輪郭線(黒より柔らかい濃紫)
} as const;

// --- トゥーンマテリアル ---

let gradientMap: THREE.DataTexture | null = null;

/**
 * トゥーン調の陰影の段階(4段階)を決めるグラデーションマップを
 * コード上で生成する。画像ファイルは使わない。
 */
export function getGradientMap(): THREE.DataTexture {
  if (!gradientMap) {
    const steps = [115, 165, 215, 255]; // 暗い側でも真っ黒にしない
    const data = new Uint8Array(steps.length * 4);
    steps.forEach((value, i) => data.set([value, value, value, 255], i * 4));
    gradientMap = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
    // 段階をくっきり出すため補間しない
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

const materialCache = new Map<string, THREE.MeshToonMaterial>();

/**
 * 同じ色のトゥーンマテリアルをキャッシュして共有する。
 * 大量のオブジェクトを置いてもマテリアル数が増えないようにするため。
 * 注意:戻り値は共有物なので、side などのプロパティを書き換えないこと。
 * 両面描画が必要な場合は doubleSidedToonMaterial() を使う。
 */
export function toonMaterial(color: number, emissive = 0x000000): THREE.MeshToonMaterial {
  const key = `${color}:${emissive}`;
  let material = materialCache.get(key);
  if (!material) {
    material = new THREE.MeshToonMaterial({
      color,
      emissive,
      gradientMap: getGradientMap(),
    });
    materialCache.set(key, material);
  }
  return material;
}

/**
 * 両面描画のトゥーンマテリアル(蝶・ハチ・トンボの羽など薄い板用)。
 * 片面用とはキャッシュのキーを分け、共有マテイアルへの設定汚染を防ぐ。
 */
export function doubleSidedToonMaterial(color: number): THREE.MeshToonMaterial {
  const key = `${color}:0:double`;
  let material = materialCache.get(key);
  if (!material) {
    material = new THREE.MeshToonMaterial({
      color,
      gradientMap: getGradientMap(),
      side: THREE.DoubleSide,
    });
    materialCache.set(key, material);
  }
  return material;
}

/**
 * ジオメトリの法線を面ごとのフラットな法線に変換する。
 * MeshToonMaterial には flatShading がないため、非インデックス化してから
 * 法線を計算し直すことでローポリらしいカクカクした陰影を出す。
 */
export function flatGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.computeVertexNormals();
  return flat;
}

// --- 草地の色ノイズ ---

const grassColorObjects = PALETTE.grass.map((hex) => new THREE.Color(hex));

/**
 * 星ごとに差し替わる色の現在値。初期値は共通パレット。
 * setPlanetTheme が content/planets.ts の台帳を見て上書きする。
 * 空・木の葉・湖の色はここを参照すること(PALETTEを直接見ると星のテーマが効かない)。
 */
export const THEME = {
  foliage: [...PALETTE.foliage] as ReadonlyArray<number>,
  sky: PALETTE.sky as number,
  skyNight: PALETTE.skyNight as number,
  skyMid: PALETTE.skyMid as number,
  skyDawn: PALETTE.skyDawn as number,
  water: PALETTE.water as number,
  sand: PALETTE.sand as number,
};

/**
 * 星ごとのテーマ(草地の色相・木の葉色・空・湖の色)を適用する。
 * 世界を作る前に一度だけ呼ぶ。定義は content/planets.ts の PLANET_DEFS(1星=1エントリ)。
 */
export function setPlanetTheme(planet: number): void {
  const theme = planetDef(planet).theme;
  if (!theme) return;
  if (theme.grassShift) {
    const { h, s, l } = theme.grassShift;
    for (const color of grassColorObjects) color.offsetHSL(h, s, l);
  }
  if (theme.foliage) THEME.foliage = [...theme.foliage];
  if (theme.sky?.base !== undefined) THEME.sky = theme.sky.base;
  if (theme.sky?.night !== undefined) THEME.skyNight = theme.sky.night;
  if (theme.sky?.mid !== undefined) THEME.skyMid = theme.sky.mid;
  if (theme.sky?.dawn !== undefined) THEME.skyDawn = theme.sky.dawn;
  if (theme.water !== undefined) THEME.water = theme.water;
  if (theme.sand !== undefined) THEME.sand = theme.sand;
}

/**
 * 球面上の方向から草地の色を決める。
 * 低周波のサイン波を重ねた簡易ノイズで緑のエリアを分ける。
 * 惑星の面の色と草原の草の色の両方がこれを参照するので、
 * 草の色が足元の地面のパッチ模様と揃う。
 * 戻り値は共有オブジェクトなので変更しないこと。
 */
export function grassColorAt(direction: THREE.Vector3): THREE.Color {
  const noise =
    Math.sin(direction.x * 4.3 + direction.y * 2.1) +
    Math.sin(direction.y * 3.9 + direction.z * 5.1) +
    Math.sin(direction.z * 3.3 + direction.x * 4.7);
  const t = THREE.MathUtils.clamp((noise + 3) / 6, 0, 0.999);
  return grassColorObjects[Math.floor(t * grassColorObjects.length)]!;
}
