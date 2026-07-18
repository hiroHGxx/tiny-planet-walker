import * as THREE from 'three';
import {
  PALETTE,
  PLANET_RADIUS,
  getGradientMap,
  flatGeometry,
  grassColorAt,
} from './palette.ts';
import { createGrassField } from './grass.ts';
import { addClouds, addButterflies, addShootingStars } from './ambient.ts';
import { addCollider } from './collision.ts';
import { placeOnPlanet } from './placement.ts';
import {
  createRoundLeafHerb,
  createStarFlowerHerb,
  createGlowHerb,
  createBerryHerb,
  createSmallFlower,
  createRosetteHerb,
  createBudHerb,
  createPaleMushroomCluster,
  createTree,
  createRock,
  createMushroom,
  createCrate,
  createPottedHerb,
  createStump,
  createLantern,
  createDryingRack,
} from './flora.ts';
import { createShop } from './shop.ts';
import { Npc } from './npc.ts';
import { addWildlife, type WildAnimal } from './animals.ts';
import {
  addRoads,
  addLake,
  addHill,
  addVillage,
  addPasture,
  addFarmField,
  addOenHouse,
  placeHouse,
  moveToward,
  yawTowards,
} from './town.ts';

import type { HerbSighting } from './journal.ts';

// player.ts / camera.ts が参照している定数をそのまま提供する
export { PLANET_RADIUS } from './palette.ts';

type Rand = () => number;

/**
 * 図鑑に記録する薬草の種類(ファクトリ→種類ID)。
 * 表示名や説明文は journal.ts の HERB_SPECIES が持つ
 */
const HERB_SPECIES_ID = new Map<(rand: Rand) => THREE.Group, string>([
  [createRoundLeafHerb, 'roundleaf'],
  [createStarFlowerHerb, 'starflower'],
  [createGlowHerb, 'glow'],
  [createBerryHerb, 'berry'],
  [createSmallFlower, 'smallflower'],
  [createRosetteHerb, 'rosette'],
  [createBudHerb, 'bud'],
]);

/** 再現性のある簡易乱数(毎回同じ配置になるようにする) */
function createRandom(seed: number): Rand {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** プレイヤー開始地点の法線(この近くには物を置かない) */
const START_NORMAL = new THREE.Vector3(0, 1, 0);

/** 薬屋を置く方向(開始地点から約115度。少し歩くと地平線から現れる) */
const SHOP_DIRECTION = new THREE.Vector3(0.85, -0.42, 0.3).normalize();

/**
 * 薬草の群生地の中心方向。
 * 群生地のまわりは草を間引いて薬草を見やすくするため、
 * 草原(createGrassField)にもこのリストを渡す
 */
const HERB_CLUSTER_CENTERS = [
  new THREE.Vector3(0.2, 1, 0.12), // 開始地点のすぐ近く
  new THREE.Vector3(1, 0.35, 0.25),
  new THREE.Vector3(-0.55, 0.3, 0.85),
  new THREE.Vector3(-0.4, -1, 0.5), // 裏側
  new THREE.Vector3(0.6, -0.4, -0.9),
  new THREE.Vector3(-0.85, -0.05, -0.6),
  new THREE.Vector3(0.15, 0.75, -0.65), // 開始地点から少し歩いた先
  new THREE.Vector3(-0.7, 0.6, 0.15),
  new THREE.Vector3(0.45, -0.8, 0.35), // 裏側その2
].map((v) => v.normalize());

// --- 町のレイアウト ---
// 惑星全体を「集落・湖・丘・森・原っぱ」でバランスよくゾーニングする。
// 残りの場所(何も置かない領域)が自然と原っぱになる

/** 集落(家の集まるエリア)の中心。1つ目は薬屋のそば=町の中心 */
/** 集落の中心(名前つき村人の配置にも使う) */
export const VILLAGE_CENTERS = [
  moveToward(SHOP_DIRECTION.clone(), new THREE.Vector3(0, -1, 0.3), 0.45), // 薬屋の先の村
  new THREE.Vector3(-0.75, 0.25, 0.6).normalize(), // 反対側の村
  new THREE.Vector3(0.05, -0.85, -0.5).normalize(), // 裏側の小さな村
];

/** 湖(方向と表面半径)。テストからも参照する */
export const LAKES = [
  { direction: new THREE.Vector3(0.5, 0.55, -0.65).normalize(), radius: 4 },
  { direction: new THREE.Vector3(-0.35, -0.45, -0.82).normalize(), radius: 2.4 },
];

/** 小高い丘(方向・表面半径・高さ) */
const HILLS = [
  { direction: new THREE.Vector3(-0.9, 0.38, 0.1).normalize(), radius: 2.8, height: 1.1 },
  { direction: new THREE.Vector3(0.35, 0.2, 0.9).normalize(), radius: 2.0, height: 0.75 },
];

/** 森(木を密集させるエリアの中心) */
const FOREST_CENTERS = [
  new THREE.Vector3(0.05, 0.45, 0.9).normalize(),
  new THREE.Vector3(-0.45, -0.7, 0.55).normalize(),
];

/** おえんちゃんの家。みんなの家から少し離れた、大通りの脇の静かな場所 */
export const OEN_HOME = new THREE.Vector3(0.7, 0.55, 0.45).normalize();

/** 大通り(開始地点→薬屋跡)の薬屋側の入り口 */
const SHOP_FRONT = moveToward(SHOP_DIRECTION.clone(), START_NORMAL, 0.1);

/** おえんちゃんの家から大通りへの最短の合流点(小道のつなぎ先) */
export const OEN_JUNCTION = (() => {
  const roadNormal = new THREE.Vector3().crossVectors(START_NORMAL, SHOP_FRONT).normalize();
  return OEN_HOME.clone().addScaledVector(roadNormal, -OEN_HOME.dot(roadNormal)).normalize();
})();

// --- 道路網のレイアウト ---

/** 大きい湖のほとりの経由地(砂の縁+道幅+余裕のぶん離す) */
const LAKE_SHORE = moveToward(LAKES[0]!.direction.clone(), VILLAGE_CENTERS[0]!, 0.245);

/** 道の弧(始点と終点)。湖の迂回処理をかける前の設計図 */
const BASE_ROAD_ARCS: Array<[THREE.Vector3, THREE.Vector3]> = [
  [START_NORMAL, SHOP_FRONT],
  [SHOP_FRONT, VILLAGE_CENTERS[0]!],
  [VILLAGE_CENTERS[0]!, LAKE_SHORE],
  [LAKE_SHORE, VILLAGE_CENTERS[1]!],
  [VILLAGE_CENTERS[1]!, VILLAGE_CENTERS[2]!],
  [VILLAGE_CENTERS[2]!, START_NORMAL],
  [OEN_JUNCTION, moveToward(OEN_HOME.clone(), OEN_JUNCTION, 0.075)], // 家までの小道
];

/**
 * 弧が湖を横切ってしまう場合、湖のまわりへ膨らむ経由点を挟んで迂回させる。
 * (砂の縁 + 道幅ぶんのクリアランスを確保する)
 * 分割してできた弧がまだ湖に近いこともあるため、
 * すべての弧がクリアランスを満たすまで繰り返し検証する。
 */
function routeAvoidingLakes(
  arcs: Array<[THREE.Vector3, THREE.Vector3]>
): Array<[THREE.Vector3, THREE.Vector3]> {
  let current = arcs;
  for (let pass = 0; pass < 6; pass++) {
    const result: Array<[THREE.Vector3, THREE.Vector3]> = [];
    let changed = false;
    for (const [from, to] of current) {
      let detour: THREE.Vector3 | null = null;
      for (const lake of LAKES) {
        const clearance = (lake.radius * 1.18 + 1.4) / PLANET_RADIUS;
        const normal = new THREE.Vector3().crossVectors(from, to);
        if (normal.lengthSq() < 1e-8) continue;
        normal.normalize();
        const offAngle = Math.asin(
          THREE.MathUtils.clamp(lake.direction.dot(normal), -1, 1)
        );
        if (Math.abs(offAngle) >= clearance) continue;
        // 湖中心を大円へ射影した点(最接近点)が弧の範囲内なら横切っている
        const foot = lake.direction
          .clone()
          .addScaledVector(normal, -lake.direction.dot(normal));
        if (foot.lengthSq() < 1e-8) continue;
        foot.normalize();
        const arcAngle = from.angleTo(to);
        if (foot.angleTo(from) > arcAngle || foot.angleTo(to) > arcAngle) continue;
        // 最接近点を湖の外へ押し出した位置を経由点にする
        detour = moveToward(lake.direction.clone(), foot, clearance + 0.04);
        break;
      }
      if (detour) {
        result.push([from, detour], [detour, to]);
        changed = true;
      } else {
        result.push([from, to]);
      }
    }
    current = result;
    if (!changed) break; // すべての弧が湖から十分離れた
  }
  return current;
}

/** 実際に敷く道の弧(湖の迂回済み)。テストからも参照する */
export const ROAD_ARCS = routeAvoidingLakes(BASE_ROAD_ARCS);

/** 方向から一番近い道の情報(符号つき角度と大円法線)。弧の範囲外は無視 */
function nearestRoadInfo(
  direction: THREE.Vector3
): { offAngle: number; normal: THREE.Vector3 } | null {
  let best: { offAngle: number; normal: THREE.Vector3 } | null = null;
  for (const [from, to] of ROAD_ARCS) {
    const normal = new THREE.Vector3().crossVectors(from, to);
    if (normal.lengthSq() < 1e-8) continue;
    normal.normalize();
    const offAngle = Math.asin(THREE.MathUtils.clamp(direction.dot(normal), -1, 1));
    const foot = direction.clone().addScaledVector(normal, -direction.dot(normal));
    if (foot.lengthSq() < 1e-8) continue;
    foot.normalize();
    const arcAngle = from.angleTo(to);
    if (foot.angleTo(from) > arcAngle + 0.02 || foot.angleTo(to) > arcAngle + 0.02) continue;
    if (!best || Math.abs(offAngle) < Math.abs(best.offAngle)) {
      best = { offAngle, normal };
    }
  }
  return best;
}

/** 方向から一番近い道までの表面距離 */
function distanceToRoads(direction: THREE.Vector3): number {
  const info = nearestRoadInfo(direction);
  return info ? Math.abs(info.offAngle) * PLANET_RADIUS : Infinity;
}

/** 道に近すぎる場合、道の法線方向へずらして clearance だけ離した方向を返す */
function pushedOffRoads(direction: THREE.Vector3, clearance: number): THREE.Vector3 {
  const result = direction.clone().normalize();
  for (let iteration = 0; iteration < 4; iteration++) {
    const info = nearestRoadInfo(result);
    if (!info || Math.abs(info.offAngle) * PLANET_RADIUS >= clearance) break;
    const sign = info.offAngle >= 0 ? 1 : -1;
    const delta = clearance / PLANET_RADIUS - Math.abs(info.offAngle) + 0.01;
    result.addScaledVector(info.normal, sign * delta).normalize();
  }
  return result;
}

/** 元の薬屋の場所に建てる緑屋根の家(道から離した位置) */
const GREEN_HOUSE_DIRECTION = pushedOffRoads(SHOP_DIRECTION.clone(), 2.4);

/** お花畑の中心 */
/** お花畑の中心(花好きの村人の配置にも使う) */
export const FLOWER_FIELDS = [
  new THREE.Vector3(-0.15, 0.85, -0.5).normalize(),
  new THREE.Vector3(-0.85, -0.4, 0.2).normalize(),
];

/** 畑(村のそばの耕作地)。道に重なったら自動で横へずらす */
const FARM_FIELDS = [
  moveToward(
    moveToward(VILLAGE_CENTERS[0]!.clone(), LAKES[0]!.direction, 0.2),
    START_NORMAL,
    0.14
  ),
  moveToward(VILLAGE_CENTERS[1]!.clone(), START_NORMAL, 0.24),
].map((direction) => pushedOffRoads(direction, 2.8));

/** 柵つきの牧場(村のそばでひつじを飼う)。道に重なったら自動で横へずらす */
/** 柵つき牧場の中心(ひつじ番の村人の配置にも使う) */
export const PASTURES = [
  moveToward(VILLAGE_CENTERS[0]!.clone(), HILLS[1]!.direction, 0.19),
  moveToward(VILLAGE_CENTERS[2]!.clone(), LAKES[1]!.direction, 0.18),
].map((direction) => pushedOffRoads(direction, 3.2));

/** 方向が「湖・丘・集落」のどれかに近すぎるか(配置を避けるための判定) */
function isInsideTownFeature(direction: THREE.Vector3, margin: number): boolean {
  for (const lake of LAKES) {
    if (direction.dot(lake.direction) > Math.cos((lake.radius + margin) / PLANET_RADIUS)) {
      return true;
    }
  }
  for (const hill of HILLS) {
    if (direction.dot(hill.direction) > Math.cos((hill.radius + margin) / PLANET_RADIUS)) {
      return true;
    }
  }
  for (const village of VILLAGE_CENTERS) {
    if (direction.dot(village) > Math.cos((4.5 + margin) / PLANET_RADIUS)) return true;
  }
  if (direction.dot(OEN_HOME) > Math.cos((2.6 + margin) / PLANET_RADIUS)) return true;
  for (const farm of FARM_FIELDS) {
    if (direction.dot(farm) > Math.cos((2.4 + margin) / PLANET_RADIUS)) return true;
  }
  for (const pasture of PASTURES) {
    if (direction.dot(pasture) > Math.cos((2.9 + margin) / PLANET_RADIUS)) return true;
  }
  return false;
}

/**
 * 太陽の方向。ゆっくり周回して昼夜サイクルを作る。
 * このVector3を空のシェーダーがuniformとして直接参照しているので、
 * 値を書き換えるだけで空のグラデーションも一緒に動く
 */
const SUN_DIRECTION = new THREE.Vector3(80, 30, 45).normalize();
const SUN_INITIAL = SUN_DIRECTION.clone();
/** 太陽が周回する軸(少し傾けて単調にならないようにする) */
const SUN_AXIS = new THREE.Vector3(0.3, 1, 0.2).normalize();
/** 太陽が一周する時間(秒) */
const DAY_LENGTH = 240;

// 更新関数内で使い回す一時オブジェクト
const _playerDirection = new THREE.Vector3();

/**
 * その方向での太陽の高さ(1=真昼、0=地平線、-1=真夜中)。
 * つぶやきのセリフや環境音など、昼夜で変わる演出が使う
 */
export function getSunElevation(direction: THREE.Vector3): number {
  return SUN_DIRECTION.dot(direction);
}

/** createWorld の戻り値。update のほかに、つぶやき・図鑑が使う参照を持つ */
export interface World {
  /** なでる・毛を刈るの対象になる動物たち */
  wildlife: ReadonlyArray<WildAnimal>;
  /** 「動く世界」を毎フレーム進める(playerPositionは距離カリングに使う) */
  update: (time: number, playerPosition: THREE.Vector3) => void;
  /** 村人(つぶやきの吹き出しが頭上の位置を参照する) */
  npcs: readonly Npc[];
  /** 星に生えている薬草の方向と種類(図鑑の発見判定に使う) */
  herbSightings: readonly HerbSighting[];
}

/**
 * 惑星・薬草・木・薬屋・星空・照明をまとめてシーンに追加する。
 * 戻り値の update は「動く世界」(太陽・煙・光の粒・草・雲・NPC・動物・蝶・流れ星)を
 * 毎フレーム進める。playerPosition は、遠くのNPC・動物の
 * 描画とAIを止める距離カリングに使う。
 */
export function createWorld(scene: THREE.Scene, planetIndex = 0): World {
  scene.add(createPlanet());
  scene.add(createSky());
  const { sun, fill } = addLights(scene);
  addStars(scene);

  const rand = createRandom(20260714 + planetIndex * 7919);
  // 光る薬草の位置を集めておき、あとで光の粒を漂わせる
  const glowHerbPositions: THREE.Vector3[] = [];
  // 置いた薬草の方向と種類を集めておき、図鑑の発見判定に渡す
  const herbSightings: HerbSighting[] = [];
  addHerbClusters(scene, rand, glowHerbPositions, herbSightings);
  addTrees(scene, rand);
  addRocksAndMushrooms(scene, rand);
  // 薬屋の建物(煙突と煙のある最初の家)=おえんちゃんの家。
  // みんなの家から離れた静かな場所に建て、ドアは小道の方を向ける
  const updateSmoke = addShopArea(
    scene,
    rand,
    glowHerbPositions,
    herbSightings,
    OEN_HOME,
    OEN_JUNCTION
  );
  const updateGlowParticles = addGlowParticles(scene, rand, glowHerbPositions);

  // --- 町を作る:湖・丘・道・集落・畑・牧場・お花畑 ---
  for (const lake of LAKES) addLake(scene, lake.direction, lake.radius);
  addHill(scene, HILLS[0]!.direction, HILLS[0]!.radius, HILLS[0]!.height, PALETTE.grass[1]!);
  addHill(scene, HILLS[1]!.direction, HILLS[1]!.radius, HILLS[1]!.height, PALETTE.grass[2]!);

  // 集落3つ × 4軒 = 12軒(道の上と重なる位置は避けて置く)
  for (const center of VILLAGE_CENTERS) {
    addVillage(scene, rand, center, 4, (direction) => distanceToRoads(direction) < 1.8);
  }

  // 道路網:開始地点→町の中心→村→湖のほとり→村→村→開始地点、と星を一周する。
  // 湖を横切る弧は自動で迂回し、おえんちゃんの家へは小道でつなぐ(ROAD_ARCS)
  const roadSamples = addRoads(scene, rand, ROAD_ARCS);

  // 元の薬屋の場所には、いままでおえんちゃんの家だった緑の屋根の家を建てる
  // (入れ替え。道に重ならない位置まで自動でずらしてある)
  addOenHouse(scene, rand, GREEN_HOUSE_DIRECTION, SHOP_FRONT);

  // 街道沿いの家:主要な道の途中、道から少し脇に5軒
  // (小道などの短い弧は除き、長い弧から選ぶ)
  const roadsideArcs = ROAD_ARCS.filter(([from, to]) => from.angleTo(to) > 0.3);
  let roadsidePlaced = 0;
  let roadsideAttempts = 0;
  while (roadsidePlaced < 5 && roadsideAttempts < 80) {
    roadsideAttempts++;
    const arc = roadsideArcs[roadsideAttempts % roadsideArcs.length]!;
    const t = 0.25 + rand() * 0.5;
    const axis = new THREE.Vector3().crossVectors(arc[0], arc[1]).normalize();
    const roadPoint = arc[0].clone().applyAxisAngle(axis, arc[0].angleTo(arc[1]) * t);
    const tangent = new THREE.Vector3().crossVectors(axis, roadPoint).normalize();
    const side = rand() < 0.5 ? 1 : -1;
    const direction = roadPoint
      .clone()
      .applyAxisAngle(tangent, side * 0.075)
      .normalize();
    if (direction.dot(START_NORMAL) > 0.99) continue;
    if (direction.dot(SHOP_DIRECTION) > 0.99) continue;
    if (isInsideTownFeature(direction, 0.6)) continue;
    if (distanceToRoads(direction) < 1.6) continue; // 交差点付近で別の道に重なる場合は避ける
    placeHouse(scene, rand, direction, roadPoint); // ドアは道の方を向く
    roadsidePlaced++;
  }

  // ポツンと一軒家:町からも道からも離れた原っぱに3軒
  const solitaryHomes: THREE.Vector3[] = [];
  let solitaryAttempts = 0;
  while (solitaryHomes.length < 3 && solitaryAttempts < 200) {
    solitaryAttempts++;
    const direction = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    if (direction.lengthSq() < 0.01) continue;
    direction.normalize();
    if (direction.dot(START_NORMAL) > 0.9) continue;
    if (direction.dot(SHOP_DIRECTION) > 0.97) continue;
    if (isInsideTownFeature(direction, 2)) continue;
    if (distanceToRoads(direction) < 2.5) continue; // 道の上には建てない
    if (solitaryHomes.some((home) => home.dot(direction) > Math.cos(0.3))) continue;
    placeHouse(scene, rand, direction, jitterDirection(direction, rand, 0.5));
    solitaryHomes.push(direction);
  }

  // 畑・柵つきの牧場・お花畑
  for (const farm of FARM_FIELDS) addFarmField(scene, rand, farm);
  for (const pasture of PASTURES) addPasture(scene, pasture, 2.2);
  for (const field of FLOWER_FIELDS) {
    for (let i = 0; i < 26; i++) {
      const factory = rand() < 0.6 ? createSmallFlower : createStarFlowerHerb;
      const flower = factory(rand);
      placeOnPlanet(flower, jitterDirection(field, rand, 0.075), {
        yaw: rand() * Math.PI * 2,
      });
      scene.add(flower);
      herbSightings.push({
        direction: flower.position.clone().normalize(),
        species: HERB_SPECIES_ID.get(factory)!,
        mesh: flower,
      });
    }
  }

  // 森:2つのエリアに木を密集させる(道の上は避ける)
  for (const forest of FOREST_CENTERS) {
    for (let i = 0; i < 8; i++) {
      const direction = jitterDirection(forest, rand, 0.16);
      if (isInsideTownFeature(direction, 0.5)) continue;
      if (distanceToRoads(direction) < 1.3) continue;
      const tree = createTree(rand);
      placeOnPlanet(tree, direction, { yaw: rand() * Math.PI * 2 });
      scene.add(tree);
      addCollider(direction, 0.35 * tree.scale.x);
    }
  }

  // 一面の草原。薬屋・湖・丘の上は生やさず、道の上・集落・
  // 薬草の群生地・開始地点のまわりは間引いて見やすくする
  const grass = createGrassField(rand, [
    { direction: GREEN_HOUSE_DIRECTION, surfaceRadius: 2.2, keepRatio: 0 },
    { direction: START_NORMAL, surfaceRadius: 1.2, keepRatio: 0.5 },
    ...LAKES.map((lake) => ({
      direction: lake.direction,
      surfaceRadius: lake.radius + 0.4,
      keepRatio: 0,
    })),
    ...HILLS.map((hill) => ({
      direction: hill.direction,
      surfaceRadius: hill.radius * 0.9,
      keepRatio: 0,
    })),
    ...VILLAGE_CENTERS.map((center) => ({
      direction: center,
      surfaceRadius: 4.2,
      keepRatio: 0.45,
    })),
    ...roadSamples.map((direction) => ({
      direction,
      surfaceRadius: 0.8,
      keepRatio: 0.1,
    })),
    ...HERB_CLUSTER_CENTERS.map((center) => ({
      direction: center,
      surfaceRadius: 1.4,
      keepRatio: 0.35,
    })),
    ...FARM_FIELDS.map((farm) => ({ direction: farm, surfaceRadius: 2.0, keepRatio: 0 })),
    ...FLOWER_FIELDS.map((field) => ({
      direction: field,
      surfaceRadius: 1.8,
      keepRatio: 0.5,
    })),
    { direction: OEN_HOME, surfaceRadius: 2.4, keepRatio: 0.3 },
  ]);
  scene.add(grass.mesh);

  // 住人NPCを20人、星のあちこちに散りばめる(ルールベースでうろつく)
  const npcs = addNpcs(scene, rand);

  // 動物(鳥・うさぎ・ひつじ)と虫(ハチ・トンボ)を追加する。
  // 開始地点・薬屋・湖・丘の上には湧かせない
  const wildlifeResult = addWildlife(scene, rand, [
    { direction: START_NORMAL, minDot: Math.cos(1.5 / PLANET_RADIUS) },
    { direction: SHOP_DIRECTION, minDot: Math.cos(2.5 / PLANET_RADIUS) },
    ...LAKES.map((lake) => ({
      direction: lake.direction,
      minDot: Math.cos((lake.radius + 0.6) / PLANET_RADIUS),
    })),
    ...HILLS.map((hill) => ({
      direction: hill.direction,
      minDot: Math.cos((hill.radius + 0.4) / PLANET_RADIUS),
    })),
    ...FARM_FIELDS.map((farm) => ({
      direction: farm,
      minDot: Math.cos(2.2 / PLANET_RADIUS),
    })),
    { direction: OEN_HOME, minDot: Math.cos(2.2 / PLANET_RADIUS) },
  ], [
    // 柵つきの牧場にひつじを3頭ずつ飼う
    ...PASTURES.map((pasture) => ({ direction: pasture, count: 3 })),
  ]);

  // 雲・蝶・流れ星
  const updateClouds = addClouds(scene, rand);
  const updateButterflies = addButterflies(scene, rand);
  const updateShootingStars = addShootingStars(scene, rand);

  // ここまでに置いた不透明のトゥーンオブジェクトすべてに影を落とさせる
  enableShadows(scene);

  const update = (time: number, playerPosition: THREE.Vector3) => {
    // 太陽の周回:初期方向を軸のまわりに回すだけなので誤差が蓄積しない
    SUN_DIRECTION.copy(SUN_INITIAL).applyAxisAngle(
      SUN_AXIS,
      (time * Math.PI * 2) / DAY_LENGTH
    );
    sun.position.copy(SUN_DIRECTION).multiplyScalar(100);
    fill.position.copy(SUN_DIRECTION).multiplyScalar(-100);

    _playerDirection.copy(playerPosition).normalize();

    updateSmoke(time);
    updateGlowParticles(time);
    grass.update(time);
    for (const npc of npcs) npc.update(time, _playerDirection);
    wildlifeResult.update(time, _playerDirection);
    updateClouds(time);
    updateButterflies(time);
    updateShootingStars(time);
  };

  return { update, npcs, herbSightings, wildlife: wildlifeResult.animals };
}

/**
 * オブジェクト以下の不透明なトゥーンメッシュに影を落とさせる。
 * 半透明(煙)・Points(星・光の粒)・userData.noCastShadow(惑星本体など)は
 * 対象にしない。
 */
export function enableShadows(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.noCastShadow === true) return;
    const material = mesh.material as THREE.Material;
    if ((material as THREE.MeshToonMaterial).isMeshToonMaterial && !material.transparent) {
      mesh.castShadow = true;
    }
  });
}

// --- 惑星本体 ---

/**
 * 複数の緑が混ざる草地の惑星を作る。
 * 面ごとに1色を塗る(頂点カラー)ことで、ローポリのパッチ模様にする。
 * 表面の形は変形しない(球のまま)ので、球面移動には影響しない。
 */
function createPlanet(): THREE.Mesh {
  // toNonIndexed で頂点を面ごとに独立させ、面単位で色を塗れるようにする
  const geometry = new THREE.SphereGeometry(PLANET_RADIUS, 28, 20).toNonIndexed();
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);

  const centroid = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 3) {
    // 三角形の中心方向を求める
    centroid.set(0, 0, 0);
    for (let j = 0; j < 3; j++) {
      vertex.fromBufferAttribute(position, i + j);
      centroid.add(vertex);
    }
    centroid.normalize();

    // 草原の草と同じノイズ(palette.ts)から面の色を決める
    const color = grassColorAt(centroid);

    // 面の3頂点すべてに同じ色を塗る
    for (let j = 0; j < 3; j++) {
      colors.set([color.r, color.g, color.b], (i + j) * 3);
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // 非インデックス化済みなので、ここで法線を計算し直すと面ごとの
  // フラットな法線になり、ローポリらしい陰影になる
  geometry.computeVertexNormals();

  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: getGradientMap(),
  });
  const planet = new THREE.Mesh(geometry, material);
  planet.receiveShadow = true; // 木・薬屋・雲などの影を受ける
  planet.userData.noCastShadow = true; // 自分自身は影を落とさない(アーティファクト防止)
  return planet;
}

// --- 空・照明・星空 ---

/**
 * グラデーションの空。大きな球の内側にシェーダーで色を塗る。
 * 「太陽に近い方向ほど明け方の暖色、反対側ほど夜の色」で、
 * uniformがSUN_DIRECTIONを直接参照しているため、太陽が周回すると
 * 空の明るい部分も一緒に動く。
 */
function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, // 球の内側だけを描く
    depthWrite: false,
    uniforms: {
      uSunDirection: { value: SUN_DIRECTION }, // 参照共有(毎フレーム自動反映)
      uNight: { value: new THREE.Color(PALETTE.skyNight) },
      uMid: { value: new THREE.Color(PALETTE.skyMid) },
      uDawn: { value: new THREE.Color(PALETTE.skyDawn) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDirection;
      uniform vec3 uNight;
      uniform vec3 uMid;
      uniform vec3 uDawn;
      varying vec3 vDirection;
      void main() {
        vec3 dir = normalize(vDirection);
        // 太陽方向との近さ(0=真反対、1=太陽の方向)
        float u = (dot(dir, uSunDirection) + 1.0) * 0.5;
        vec3 color = u < 0.65
          ? mix(uNight, uMid, u / 0.65)
          : mix(uMid, uDawn, (u - 0.65) / 0.35);
        // 太陽の位置にぼんやりした光球を足す
        float sunGlow = pow(max(dot(dir, uSunDirection), 0.0), 90.0);
        color += uDawn * sunGlow * 0.7;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 20), material);
  sky.userData.noOutline = true; // 輪郭線の深度パスからは外す(地平線の輪郭は惑星側で出る)
  return sky;
}

function addLights(scene: THREE.Scene): {
  sun: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
} {
  // 半球光+環境光を厚めにして、惑星のどこでも真っ暗にならないようにする
  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.9));
  // 低い位置の太陽(明け方の暖色)。空のグラデーションと同じ方向に置く
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.5);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(100);
  // 影:惑星全体(半径25+上空の雲)が収まる平行投影カメラで描く
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 55;
  sun.shadow.camera.far = 145;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.8; // ローポリの丸い地面のシャドウアクネを防ぐ
  scene.add(sun);
  scene.add(sun.target); // 常に原点(惑星の中心)へ向ける
  // 反対側からの弱い青い光(夜側の面を起こす)
  const fill = new THREE.DirectionalLight(PALETTE.fill, 0.6);
  fill.position.copy(SUN_DIRECTION).multiplyScalar(-100);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(PALETTE.ambient, 0.55));
  return { sun, fill };
}

function addStars(scene: THREE.Scene): void {
  const rand = createRandom(98765);
  // 暖色と寒色の2色の星をつくる
  const groups: Array<{ color: number; count: number; size: number }> = [
    { color: PALETTE.starWarm, count: 350, size: 1.8 },
    { color: PALETTE.starCool, count: 350, size: 1.2 },
  ];
  for (const { color, count, size } of groups) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      if (v.lengthSq() < 0.001) v.set(0, 1, 0);
      v.normalize().multiplyScalar(350 + rand() * 100);
      positions.set([v.x, v.y, v.z], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    scene.add(
      new THREE.Points(
        geometry,
        new THREE.PointsMaterial({ color, size, sizeAttenuation: false })
      )
    );
  }
}

// --- 配置 ---

/** 方向ベクトルに接線方向のずれを加えて、群生のばらつきを作る */
function jitterDirection(base: THREE.Vector3, rand: Rand, amount: number): THREE.Vector3 {
  return base
    .clone()
    .add(
      new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(amount)
    )
    .normalize();
}

/**
 * 薬草の群生地。開始地点のそばにも置き、すぐに薬草星だと分かるようにする。
 * 7種類の薬草・花を数本ずつまとめて生やし、「観察したくなる場所」を作る。
 * 置いた株は sightings に記録し、図鑑の発見判定に使う
 */
function addHerbClusters(
  scene: THREE.Scene,
  rand: Rand,
  glowHerbPositions: THREE.Vector3[],
  sightings: HerbSighting[]
): void {
  const herbFactories = [
    createRoundLeafHerb,
    createStarFlowerHerb,
    createGlowHerb,
    createBerryHerb,
    createSmallFlower,
    createRosetteHerb,
    createBudHerb,
  ];
  for (const center of HERB_CLUSTER_CENTERS) {
    const herbCount = 6 + Math.floor(rand() * 3); // 群生ごとに6〜8株
    for (let i = 0; i < herbCount; i++) {
      const factory = herbFactories[Math.floor(rand() * herbFactories.length)]!;
      const herb = factory(rand);
      placeOnPlanet(herb, jitterDirection(center, rand, 0.1), {
        yaw: rand() * Math.PI * 2,
      });
      scene.add(herb);
      if (factory === createGlowHerb) glowHerbPositions.push(herb.position.clone());
      sightings.push({
        direction: herb.position.clone().normalize(),
        species: HERB_SPECIES_ID.get(factory)!,
        mesh: herb,
      });
    }
    // 群生地の脇に、小さな花のかたまりを添える
    const flowerCount = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < flowerCount; i++) {
      const flower = createSmallFlower(rand);
      placeOnPlanet(flower, jitterDirection(center, rand, 0.16), {
        yaw: rand() * Math.PI * 2,
      });
      scene.add(flower);
      sightings.push({
        direction: flower.position.clone().normalize(),
        species: HERB_SPECIES_ID.get(createSmallFlower)!,
        mesh: flower,
      });
    }
  }
}

/** 木。フィボナッチ球で全体に散らし、開始地点と薬屋の近くは避ける */
function addTrees(scene: THREE.Scene, rand: Rand): void {
  const treeCount = 13;
  let placed = 0;
  let attempts = 0;
  while (placed < treeCount && attempts < 200) {
    attempts++;
    const t = (placed + 0.5) / treeCount;
    const phi = Math.acos(1 - 2 * t);
    const theta = Math.PI * (1 + Math.sqrt(5)) * placed + rand() * 1.4;
    const direction = jitterDirection(
      new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ),
      rand,
      0.3
    );
    // 開始地点の近く・薬屋の敷地・湖・丘・集落・道の上には置かない
    if (direction.dot(START_NORMAL) > 0.92) continue;
    if (direction.dot(SHOP_DIRECTION) > 0.985) continue;
    if (isInsideTownFeature(direction, 0.8)) continue;
    if (distanceToRoads(direction) < 1.3) continue;

    const tree = createTree(rand);
    placeOnPlanet(tree, direction, { yaw: rand() * Math.PI * 2 });
    scene.add(tree);
    // 幹の太さに合わせた当たり判定(葉には当たらず、下をくぐれる見た目に合う)
    addCollider(direction, 0.35 * tree.scale.x);
    placed++;
  }
}

/** 岩とキノコを全体に散らす(道の上は避け、置けなかった分はやり直す) */
function addRocksAndMushrooms(scene: THREE.Scene, rand: Rand): void {
  let rocksPlaced = 0;
  let rockAttempts = 0;
  while (rocksPlaced < 8 && rockAttempts < 100) {
    rockAttempts++;
    const direction = new THREE.Vector3(
      rand() * 2 - 1,
      rand() * 2 - 1,
      rand() * 2 - 1
    ).normalize();
    if (direction.dot(START_NORMAL) > 0.9) continue;
    if (direction.dot(SHOP_DIRECTION) > 0.98) continue;
    if (isInsideTownFeature(direction, 0.3)) continue;
    if (distanceToRoads(direction) < 1.4) continue; // 道の上・道ぎわには置かない
    const rock = createRock(rand);
    placeOnPlanet(rock, direction, { sink: 0.1, yaw: rand() * Math.PI * 2 });
    scene.add(rock);
    addCollider(direction, 0.55);
    rocksPlaced++;
  }
  // キノコ:アクセントの赤紫と、薬草星らしい淡い色の群れを半々に散らす
  let mushroomsPlaced = 0;
  let mushroomAttempts = 0;
  while (mushroomsPlaced < 10 && mushroomAttempts < 100) {
    mushroomAttempts++;
    const direction = new THREE.Vector3(
      rand() * 2 - 1,
      rand() * 2 - 1,
      rand() * 2 - 1
    ).normalize();
    if (direction.dot(START_NORMAL) > 0.9) continue;
    if (isInsideTownFeature(direction, 0.2)) continue;
    if (distanceToRoads(direction) < 1.0) continue;
    const mushroom =
      mushroomsPlaced % 2 === 0 ? createMushroom(rand) : createPaleMushroomCluster(rand);
    placeOnPlanet(mushroom, direction, { yaw: rand() * Math.PI * 2 });
    scene.add(mushroom);
    mushroomsPlaced++;
  }
}

/**
 * 住人NPCを20人配置する。
 * 1人は薬屋の店番、各集落に4人ずつ(村の住人)、残りは原っぱに散らばる。
 * 湖・丘・開始地点の真上は避ける
 */
function addNpcs(scene: THREE.Scene, rand: Rand): Npc[] {
  const homes: THREE.Vector3[] = [];
  const east = new THREE.Vector3()
    .crossVectors(SHOP_DIRECTION, new THREE.Vector3(0, 1, 0))
    .normalize();
  const north = new THREE.Vector3().crossVectors(east, SHOP_DIRECTION).normalize();
  homes.push(
    SHOP_DIRECTION.clone()
      .addScaledVector(east, 0.18)
      .addScaledVector(north, 0.06)
      .normalize()
  );

  // 各集落の広場に4人ずつ住まわせる(広場が広がったので少し散らす)
  for (const village of VILLAGE_CENTERS) {
    for (let i = 0; i < 4; i++) {
      homes.push(jitterDirection(village, rand, 0.06));
    }
  }

  // 残りは原っぱに散らばる一人暮らし
  let attempts = 0;
  while (homes.length < 20 && attempts < 400) {
    attempts++;
    const direction = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    if (direction.lengthSq() < 0.01) continue;
    direction.normalize();
    if (direction.dot(START_NORMAL) > 0.995) continue; // 開始地点の真上は避ける
    if (direction.dot(SHOP_DIRECTION) > 0.995) continue; // 薬屋の建物の上は避ける
    if (isInsideTownFeature(direction, 0.8)) continue; // 湖・丘・集落は避ける
    if (homes.some((home) => home.dot(direction) > Math.cos(0.12))) continue; // 家の間隔を空ける
    homes.push(direction);
  }

  const npcs: Npc[] = [];
  for (const home of homes) {
    const npc = new Npc(home, rand);
    scene.add(npc.mesh);
    npcs.push(npc);
  }
  return npcs;
}

/**
 * 薬屋(おえんちゃんの家)とその周辺の小物。
 * 戻り値は煙突の煙を進める更新関数。
 * homeDirection に建て、ドアは faceTarget(小道の方)へ向ける
 */
function addShopArea(
  scene: THREE.Scene,
  rand: Rand,
  glowHerbPositions: THREE.Vector3[],
  sightings: HerbSighting[],
  homeDirection: THREE.Vector3,
  faceTarget: THREE.Vector3
): (time: number) => void {
  // 家の位置での接線方向の基準(周辺の小物をずらして置くのに使う)
  const east = new THREE.Vector3()
    .crossVectors(homeDirection, new THREE.Vector3(0, 1, 0))
    .normalize();
  const north = new THREE.Vector3().crossVectors(east, homeDirection).normalize();
  /** 家から東西南北へ angle ラジアンだけずらした方向を作る */
  const offset = (eastAmount: number, northAmount: number) =>
    homeDirection
      .clone()
      .addScaledVector(east, eastAmount)
      .addScaledVector(north, northAmount)
      .normalize();

  const shop = createShop();
  // 底が平らな建物なので、角が浮かないよう少し深めに沈める
  placeOnPlanet(shop, homeDirection, {
    sink: 0.09,
    yaw: yawTowards(homeDirection, faceTarget),
  });
  scene.add(shop);
  // 建物の対角半分+少しの余裕を当たり判定にする
  addCollider(homeDirection, 1.9);

  // 店のまわりの小物(角度0.01 ≈ 表面距離0.25の間隔)。末尾は当たり判定の半径
  const props: Array<[THREE.Group, number, number, number, number]> = [
    [createLantern(), -0.11, -0.05, 0, 0.15], // ドアのそばのランタン
    [createCrate(rand), 0.13, 0.03, rand() * Math.PI, 0.35],
    [createCrate(rand), 0.15, -0.02, rand() * Math.PI, 0.35],
    [createPottedHerb(rand), -0.13, 0.02, 0, 0.18],
    [createDryingRack(rand), 0.02, 0.14, 1.2, 0.45],
    [createStump(rand), -0.1, 0.12, 0, 0.4],
    [createRock(rand), 0.1, 0.14, rand() * Math.PI, 0.55],
  ];
  for (const [prop, eastAmount, northAmount, yaw, colliderRadius] of props) {
    const direction = offset(eastAmount, northAmount);
    placeOnPlanet(prop, direction, { yaw });
    scene.add(prop);
    addCollider(direction, colliderRadius);
  }

  // 店の近くにも薬草の群生を置く(店先らしく種類は多めに)
  const herbFactories = [
    createRoundLeafHerb,
    createStarFlowerHerb,
    createGlowHerb,
    createBerryHerb,
    createSmallFlower,
    createBudHerb,
  ];
  for (let i = 0; i < 6; i++) {
    const factory = herbFactories[Math.floor(rand() * herbFactories.length)]!;
    const herb = factory(rand);
    placeOnPlanet(herb, jitterDirection(offset(-0.16, -0.1), rand, 0.06), {
      yaw: rand() * Math.PI * 2,
    });
    scene.add(herb);
    if (factory === createGlowHerb) glowHerbPositions.push(herb.position.clone());
    sightings.push({
      direction: herb.position.clone().normalize(),
      species: HERB_SPECIES_ID.get(factory)!,
      mesh: herb,
    });
  }

  // --- 煙突の煙 ---
  // 半透明の球を「昇りながら大きくなり、薄れて消える」ループで動かす。
  // 薬屋グループの子にしてあるので、ローカル+Y(=その地点の球面法線の向き)
  // へ昇り、惑星のどこに店があっても正しく上へ立ちのぼる
  const puffGeometry = flatGeometry(new THREE.SphereGeometry(1, 6, 5));
  const puffs: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  for (let i = 0; i < 4; i++) {
    const puff = new THREE.Mesh(
      puffGeometry,
      new THREE.MeshBasicMaterial({
        color: PALETTE.smoke,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    shop.add(puff);
    puffs.push(puff);
  }
  return (time: number) => {
    for (let i = 0; i < puffs.length; i++) {
      const puff = puffs[i]!;
      // 0→1 が煙ひとつの一生。4つの煙の位相をずらしてループさせる
      const t = (time * 0.22 + i / puffs.length) % 1;
      puff.position.set(0.75 + t * 0.25, 2.95 + t * 1.5, 0.45 + t * 0.1);
      puff.scale.setScalar(0.1 + t * 0.24);
      // 出現時にふっと現れ、昇るほど薄くなる
      puff.material.opacity = 0.4 * (1 - t) * Math.min(1, t * 6);
    }
  };
}

/** 光る薬草のまわりに、ゆっくり漂う小さな光の粒を出す */
function addGlowParticles(
  scene: THREE.Scene,
  rand: Rand,
  glowHerbPositions: THREE.Vector3[]
): (time: number) => void {
  interface Particle {
    base: THREE.Vector3; // 漂いの中心(薬草の少し上)
    normal: THREE.Vector3; // その地点の球面法線
    tangentA: THREE.Vector3; // 接平面の基準ベクトル2本
    tangentB: THREE.Vector3;
    phase: number;
    speed: number;
    radius: number;
  }
  const particlesPerHerb = 3;
  const particles: Particle[] = [];
  for (const herbPosition of glowHerbPositions) {
    const normal = herbPosition.clone().normalize();
    // 法線と平行にならない軸を選んで、接平面の基準ベクトルを作る
    const reference =
      Math.abs(normal.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
    const tangentA = new THREE.Vector3().crossVectors(normal, reference).normalize();
    const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();
    for (let i = 0; i < particlesPerHerb; i++) {
      particles.push({
        base: herbPosition.clone().addScaledVector(normal, 0.35 + rand() * 0.4),
        normal,
        tangentA,
        tangentB,
        phase: rand() * Math.PI * 2,
        speed: 0.4 + rand() * 0.5,
        radius: 0.12 + rand() * 0.15,
      });
    }
  }

  const positions = new Float32Array(particles.length * 3);
  const attribute = new THREE.BufferAttribute(positions, 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', attribute);
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: PALETTE.glowBerry,
      size: 0.09,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
  );
  // 粒は惑星全体に散らばるので、視錐台カリングの誤判定を避ける
  points.frustumCulled = false;
  scene.add(points);

  const workPosition = new THREE.Vector3();
  const update = (time: number) => {
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i]!;
      const angle = time * particle.speed + particle.phase;
      // 法線方向にゆっくり上下しつつ、接平面上で小さな円を描いて漂う
      workPosition
        .copy(particle.base)
        .addScaledVector(particle.normal, Math.sin(angle * 0.8) * 0.18)
        .addScaledVector(particle.tangentA, Math.cos(angle) * particle.radius)
        .addScaledVector(particle.tangentB, Math.sin(angle) * particle.radius);
      positions[i * 3] = workPosition.x;
      positions[i * 3 + 1] = workPosition.y;
      positions[i * 3 + 2] = workPosition.z;
    }
    attribute.needsUpdate = true;
  };
  update(0);
  return update;
}
