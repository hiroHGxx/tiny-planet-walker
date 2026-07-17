import * as THREE from 'three';
import {
  PLANET_RADIUS,
  getGradientMap,
  grassColorAt,
} from './palette.ts';

/**
 * 惑星全体を覆う草原。
 * 約18,000本の草を InstancedMesh 1つ(=1ドローコール)で描き、
 * 風の揺れは頂点シェーダーで先端だけを揺らす。
 */

type Rand = () => number;

const GRASS_COUNT = 18000;
const BLADE_HEIGHT = 0.24;

/** 草を生やさない/減らす場所(薬草の群生地などを見やすくする) */
export interface GrassAvoidZone {
  /** 場所の中心方向(単位ベクトル) */
  direction: THREE.Vector3;
  /** 表面に沿った半径(ワールド単位) */
  surfaceRadius: number;
  /** その場所に残す草の割合(0 = 全部消す、0.5 = 半分残す) */
  keepRatio: number;
}

/** 先が細くなる1枚の草の葉(三角形3枚)。短め・太めのやさしい形 */
function createBladeGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  // 根元が広く、中間でくびれ、先端が1点になる形
  const positions = new Float32Array([
    -0.04, 0, 0,
    0.04, 0, 0,
    -0.027, 0.12, 0,
    0.027, 0.12, 0,
    0, BLADE_HEIGHT, 0,
  ]);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  geometry.computeVertexNormals();
  return geometry;
}

export function createGrassField(
  rand: Rand,
  avoidZones: GrassAvoidZone[]
): { mesh: THREE.InstancedMesh; update: (time: number) => void } {
  const timeUniform = { value: 0 };

  const material = new THREE.MeshToonMaterial({
    gradientMap: getGradientMap(),
    side: THREE.DoubleSide,
  });
  // 標準のトゥーンシェーダーに「風揺れ」の頂点変形だけを注入する
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // 風揺れ:根元(y=0)は固定し、先端ほど大きく揺らす。
        // 揺れの位相はインスタンスの位置から作り、株ごとにばらす
        float windHeight = position.y / ${BLADE_HEIGHT.toFixed(2)};
        float windPhase = dot(instanceMatrix[3].xyz, vec3(0.9898, 0.78233, 0.5719)) * 7.0;
        float windSway = sin(uTime * 1.6 + windPhase) * 0.05
                       + sin(uTime * 3.1 + windPhase * 1.7) * 0.025;
        transformed.x += windSway * windHeight * windHeight;
        transformed.z += cos(uTime * 1.1 + windPhase) * 0.03 * windHeight * windHeight;
        `
      );
  };
  // onBeforeCompile を使うマテリアルは、他のトゥーンマテリアルと
  // シェーダープログラムを取り違えないよう固有のキーを持たせる
  material.customProgramCacheKey = () => 'grass-wind';

  const mesh = new THREE.InstancedMesh(createBladeGeometry(), material, GRASS_COUNT);

  const direction = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const alignQuat = new THREE.Quaternion();
  const yawQuat = new THREE.Quaternion();
  const tiltQuat = new THREE.Quaternion();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();

  // 減らす場所を事前計算(角度のコサインで比較する)
  const zones = avoidZones.map((zone) => ({
    direction: zone.direction.clone().normalize(),
    cosAngle: Math.cos(zone.surfaceRadius / PLANET_RADIUS),
    keepRatio: zone.keepRatio,
  }));

  let placed = 0;
  while (placed < GRASS_COUNT) {
    // 球面上に一様分布でばらまく
    const z = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    direction.set(r * Math.cos(theta), z, r * Math.sin(theta));
    // 薬屋の足元や薬草の群生地では、草を消す/間引いて見やすくする
    let skip = false;
    for (const zone of zones) {
      if (direction.dot(zone.direction) > zone.cosAngle && rand() >= zone.keepRatio) {
        skip = true;
        break;
      }
    }
    if (skip) continue;

    // 根元を惑星表面に、上方向を球面法線に合わせる(placement.tsと同じ考え方)
    position.copy(direction).multiplyScalar(PLANET_RADIUS - 0.01);
    alignQuat.setFromUnitVectors(yAxis, direction);
    yawQuat.setFromAxisAngle(yAxis, rand() * Math.PI * 2);
    // 株ごとに少し傾け、まっすぐ立ちすぎないやわらかい草原にする
    tiltQuat.setFromAxisAngle(xAxis, (rand() - 0.5) * 0.35);
    quaternion.copy(alignQuat).multiply(yawQuat).multiply(tiltQuat);
    const s = 0.65 + rand() * 0.75;
    scale.set(s, s * (0.7 + rand() * 0.7), s);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(placed, matrix);

    // 足元の地面のパッチ模様と同じノイズから色を取り、少し明るさをばらす
    color.copy(grassColorAt(direction)).multiplyScalar(0.95 + rand() * 0.35);
    mesh.setColorAt(placed, color);
    placed++;
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  // 惑星全体に広がるので視錐台カリングは無効にする
  mesh.frustumCulled = false;
  mesh.castShadow = false; // 2.5万本の影は重いので落とさない
  mesh.userData.noCastShadow = true; // enableShadows の対象からも外す
  mesh.receiveShadow = true; // 木や雲の影は受ける
  mesh.userData.noOutline = true; // 輪郭線の対象からも外す(細かすぎてノイズになる)

  return {
    mesh,
    update: (time: number) => {
      timeUniform.value = time;
    },
  };
}
