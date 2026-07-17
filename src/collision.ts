import * as THREE from 'three';
import { PLANET_RADIUS } from './palette.ts';

/**
 * 球面上の簡易衝突判定。
 *
 * 各障害物を「球面上の中心方向 + 表面上の半径」の円として登録し、
 * プレイヤーが円に入ったら、障害物の中心から遠ざかる大円に沿って
 * 押し出す。進行方向のうち障害物へ向かう成分だけが打ち消されるので、
 * 斜めにぶつかったときは自然に横へスライドする。
 */

export interface SurfaceCollider {
  /** 障害物の中心の方向(単位ベクトル) */
  direction: THREE.Vector3;
  /** 障害物の半径(惑星表面に沿った距離、ワールド単位) */
  radius: number;
}

const colliders: SurfaceCollider[] = [];

/**
 * 障害物を登録する(direction はコピーして保持する)。
 * 戻り値の direction を書き換えれば、動く障害物(NPCなど)にも使える
 */
export function addCollider(direction: THREE.Vector3, radius: number): SurfaceCollider {
  const collider = { direction: direction.clone().normalize(), radius };
  colliders.push(collider);
  return collider;
}

const _axis = new THREE.Vector3();
const _pushQuat = new THREE.Quaternion();

/**
 * 位置がどの障害物の円にも入らないよう押し出す。
 * position は惑星中心から半径 PLANET_RADIUS の球面上にある前提。
 * 押し出しは回転(applyQuaternion)なので、中心からの距離は変わらない。
 * ignore を渡すと、その障害物だけ判定から外す(NPCが自分自身と
 * 衝突しないようにするため)。
 *
 * 押し出された先で別の障害物へ入り直すことがあるため(家や柵の密集地)、
 * どこにも入らなくなるまで最大3回繰り返す。
 */
export function resolveCollisions(
  position: THREE.Vector3,
  playerRadius: number,
  ignore?: SurfaceCollider
): void {
  for (let iteration = 0; iteration < 3; iteration++) {
    let pushed = false;
    for (const collider of colliders) {
      if (collider === ignore) continue;
      // プレイヤーと障害物の中心のなす角(大円距離 = 角度 × 惑星半径)
      const cosAngle = THREE.MathUtils.clamp(
        position.dot(collider.direction) / PLANET_RADIUS,
        -1,
        1
      );
      const minAngle = (collider.radius + playerRadius) / PLANET_RADIUS;
      if (cosAngle <= Math.cos(minAngle)) continue; // 円の外なら何もしない

      const angle = Math.acos(cosAngle);

      // 押し出しの回転軸 = 障害物中心 × プレイヤー位置。
      // この軸まわりの正の回転は、プレイヤーを障害物から遠ざける向きになる
      _axis.crossVectors(collider.direction, position);
      if (_axis.lengthSq() < 1e-8) {
        // 障害物の真上に完全に重なった場合は、適当な垂直方向へ逃がす
        _axis.set(collider.direction.y, -collider.direction.x, 0);
        if (_axis.lengthSq() < 1e-8) _axis.set(1, 0, 0);
      }
      _axis.normalize();
      _pushQuat.setFromAxisAngle(_axis, minAngle - angle);
      position.applyQuaternion(_pushQuat);
      pushed = true;
    }
    if (!pushed) break; // どの障害物にも入っていない
  }
}
