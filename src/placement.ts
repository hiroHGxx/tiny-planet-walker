import * as THREE from 'three';
import { PLANET_RADIUS } from './palette.ts';

const _normal = new THREE.Vector3();
const _align = new THREE.Quaternion();
const _yaw = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);

/** 緯度・経度(度)から球面上の方向ベクトルを作る */
export function directionFromLatLon(latDeg: number, lonDeg: number): THREE.Vector3 {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(lonDeg);
  return new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.sin(lon)
  );
}

export interface PlaceOptions {
  /**
   * 根元を惑星表面へ少し埋める量。
   * 底が平らなオブジェクトは、球面が足元から離れていく分だけ
   * 角が浮いて見えるので、わずかに沈めて隙間を隠す
   */
  sink?: number;
  /** その場での向き(ローカルY軸まわりの回転、ラジアン) */
  yaw?: number;
}

/**
 * 球面上へのオブジェクト配置の共通処理。
 *
 * 前提:オブジェクトは「原点が根元(足元)、+Y が上」になるように
 * 組み立てておく。高さのあるオブジェクトは子メッシュを +Y 方向へ
 * 積み上げてあるので、根元を表面に合わせれば埋まらない。
 */
export function placeOnPlanet(
  object: THREE.Object3D,
  direction: THREE.Vector3,
  options: PlaceOptions = {}
): void {
  const { sink = 0.05, yaw = 0 } = options;

  // 方向ベクトルを正規化して球面法線にする(惑星中心 → 配置地点)
  _normal.copy(direction).normalize();

  // 根元を惑星表面(から sink だけ内側)へ置く
  object.position.copy(_normal).multiplyScalar(PLANET_RADIUS - sink);

  // オブジェクトの上方向(+Y)を球面法線へ向ける最小回転
  _align.setFromUnitVectors(_yAxis, _normal);
  // さらにローカルY軸(=法線)まわりに yaw だけ回して向きをばらけさせる
  _yaw.setFromAxisAngle(_yAxis, yaw);
  object.quaternion.copy(_align).multiply(_yaw);
}
