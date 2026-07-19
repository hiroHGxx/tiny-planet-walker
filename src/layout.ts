import * as THREE from 'three';
import { PLANET_RADIUS } from './palette.ts';
import { moveToward } from './town.ts';
import { currentPlanet } from './features/planet-state.ts';
import { planetDef } from './content/planets.ts';

/**
 * 星のレイアウト計画。
 * 「どこに村・湖・丘・道・畑・群生地を置くか」の設計図をここに集約する
 * (実際にメッシュを作って置くのは world.ts の仕事)。
 * ランドマークを増やす・星の地形を変えるときは、このファイルと
 * content/planets.ts(星ごとの上書き)だけを触ればよい。
 */

/**
 * 星ごとに大陸の並びを回す回転。2つ目以降の星では村・湖・道の位置関係が
 * 開始地点から見てまったく変わる(根っこの配置定数に一度だけ掛ける)
 */
export const LAYOUT_ROTATION = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0.9, 0.25, 0.35).normalize(),
  // 4=もみじ(旧こもれび)・5=こなゆき(旧しんじゅ)は改装前の角度を引き継ぎ、
  // 春(2)・夏(3)は新しい角度で地形の並びを変える
  [0, 2.7, 5.1, 1.9, 3.9][currentPlanet() - 1] ?? (currentPlanet() - 1) * 1.3
);

/** プレイヤー開始地点の法線(この近くには物を置かない) */
export const START_NORMAL = new THREE.Vector3(0, 1, 0);

/** 薬屋を置く方向(開始地点から約115度。少し歩くと地平線から現れる) */
export const SHOP_DIRECTION = new THREE.Vector3(0.85, -0.42, 0.3).normalize().applyQuaternion(LAYOUT_ROTATION);

/**
 * 薬草の群生地の中心方向。
 * 群生地のまわりは草を間引いて薬草を見やすくするため、
 * 草原(createGrassField)にもこのリストを渡す
 */
export const HERB_CLUSTER_CENTERS = [
  new THREE.Vector3(0.2, 1, 0.12), // 開始地点のすぐ近く
  new THREE.Vector3(1, 0.35, 0.25),
  new THREE.Vector3(-0.55, 0.3, 0.85),
  new THREE.Vector3(-0.4, -1, 0.5), // 裏側
  new THREE.Vector3(0.6, -0.4, -0.9),
  new THREE.Vector3(-0.85, -0.05, -0.6),
  new THREE.Vector3(0.15, 0.75, -0.65), // 開始地点から少し歩いた先
  new THREE.Vector3(-0.7, 0.6, 0.15),
  new THREE.Vector3(0.45, -0.8, 0.35), // 裏側その2
].map((v) => v.normalize().applyQuaternion(LAYOUT_ROTATION));

// --- 町のレイアウト ---
// 惑星全体を「集落・湖・丘・森・原っぱ」でバランスよくゾーニングする。
// 残りの場所(何も置かない領域)が自然と原っぱになる

/** 集落の中心(名前つき村人の配置にも使う)。1つ目は薬屋のそば=町の中心 */
export const VILLAGE_CENTERS = [
  moveToward(SHOP_DIRECTION.clone(), new THREE.Vector3(0, -1, 0.3), 0.45), // 薬屋の先の村
  new THREE.Vector3(-0.75, 0.25, 0.6).normalize().applyQuaternion(LAYOUT_ROTATION), // 反対側の村
  new THREE.Vector3(0.05, -0.85, -0.5).normalize().applyQuaternion(LAYOUT_ROTATION), // 裏側の小さな村
];

/**
 * 湖(方向と表面半径)。テストからも参照する。
 * 星の台帳(content/planets.ts)に layout.lakes があればそちらを使う
 * (夏の星の大きな海+広い砂浜など、星ごとの大胆な地形替えに使う。
 *  上書きの方向は絶対値=LAYOUT_ROTATIONを掛けないので星ごとに直接決める)
 */
export const LAKES: ReadonlyArray<{
  direction: THREE.Vector3;
  radius: number;
  beach?: number;
}> = planetDef(currentPlanet()).layout?.lakes ?? [
  { direction: new THREE.Vector3(0.5, 0.55, -0.65).normalize().applyQuaternion(LAYOUT_ROTATION), radius: 4 },
  { direction: new THREE.Vector3(-0.35, -0.45, -0.82).normalize().applyQuaternion(LAYOUT_ROTATION), radius: 2.4 },
];

/** 小高い丘(方向・表面半径・高さ) */
export const HILLS = [
  { direction: new THREE.Vector3(-0.9, 0.38, 0.1).normalize().applyQuaternion(LAYOUT_ROTATION), radius: 2.8, height: 1.1 },
  { direction: new THREE.Vector3(0.35, 0.2, 0.9).normalize().applyQuaternion(LAYOUT_ROTATION), radius: 2.0, height: 0.75 },
];

/** 森(木を密集させるエリアの中心) */
export const FOREST_CENTERS = [
  new THREE.Vector3(0.05, 0.45, 0.9).normalize().applyQuaternion(LAYOUT_ROTATION),
  new THREE.Vector3(-0.45, -0.7, 0.55).normalize().applyQuaternion(LAYOUT_ROTATION),
];

/** おえんちゃんの家。みんなの家から少し離れた、大通りの脇の静かな場所 */
export const OEN_HOME = new THREE.Vector3(0.7, 0.55, 0.45).normalize().applyQuaternion(LAYOUT_ROTATION);

/** 大通り(開始地点→薬屋跡)の薬屋側の入り口 */
export const SHOP_FRONT = moveToward(SHOP_DIRECTION.clone(), START_NORMAL, 0.1);

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
export function distanceToRoads(direction: THREE.Vector3): number {
  const info = nearestRoadInfo(direction);
  return info ? Math.abs(info.offAngle) * PLANET_RADIUS : Infinity;
}

/** 道に近すぎる場合、道の法線方向へずらして clearance だけ離した方向を返す */
export function pushedOffRoads(direction: THREE.Vector3, clearance: number): THREE.Vector3 {
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
export const GREEN_HOUSE_DIRECTION = pushedOffRoads(SHOP_DIRECTION.clone(), 2.4);

/** お花畑の中心(花好きの村人の配置にも使う) */
export const FLOWER_FIELDS = [
  new THREE.Vector3(-0.15, 0.85, -0.5).normalize().applyQuaternion(LAYOUT_ROTATION),
  new THREE.Vector3(-0.85, -0.4, 0.2).normalize().applyQuaternion(LAYOUT_ROTATION),
];

/** 畑(村のそばの耕作地)。道に重なったら自動で横へずらす */
export const FARM_FIELDS = [
  moveToward(
    moveToward(VILLAGE_CENTERS[0]!.clone(), LAKES[0]!.direction, 0.2),
    START_NORMAL,
    0.14
  ),
  moveToward(VILLAGE_CENTERS[1]!.clone(), START_NORMAL, 0.24),
].map((direction) => pushedOffRoads(direction, 2.8));

/** 柵つき牧場の中心(ひつじ番の村人の配置にも使う)。道に重なったら自動で横へずらす */
export const PASTURES = [
  moveToward(VILLAGE_CENTERS[0]!.clone(), HILLS[1]!.direction, 0.19),
  // 2つ目の湖は上書きレイアウトの星では無いこともある(その場合は1つ目に寄せる)
  moveToward(VILLAGE_CENTERS[2]!.clone(), (LAKES[1] ?? LAKES[0])!.direction, 0.18),
].map((direction) => pushedOffRoads(direction, 3.2));

/** 方向が「湖・丘・集落」のどれかに近すぎるか(配置を避けるための判定) */
export function isInsideTownFeature(direction: THREE.Vector3, margin: number): boolean {
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
