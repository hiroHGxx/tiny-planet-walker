import * as THREE from 'three';
import {
  PALETTE,
  PLANET_RADIUS,
  toonMaterial,
  doubleSidedToonMaterial,
  flatGeometry,
} from './palette.ts';
import { directionFromLatLon } from './placement.ts';

/**
 * 環境演出:惑星を回る雲、飛び回る蝶、流れ星。
 * どれも「時間を受け取って状態を進める更新関数」を返す。
 */

type Rand = () => number;
type Updater = (time: number) => void;

// --- 雲 ---

/** 惑星の上空をゆっくり周回するローポリの雲。地面に影を落とす */
export function addClouds(scene: THREE.Scene, rand: Rand): Updater {
  const puffGeometry = flatGeometry(new THREE.SphereGeometry(1, 7, 5));
  const cloudMaterial = toonMaterial(PALETTE.cloud);

  interface Cloud {
    pivot: THREE.Object3D;
    baseQuat: THREE.Quaternion;
    axis: THREE.Vector3;
    speed: number;
  }
  const clouds: Cloud[] = [];
  const cloudCount = 6;
  for (let i = 0; i < cloudCount; i++) {
    const cloud = new THREE.Group();
    // 3〜5個のつぶした球を横に並べて雲のかたまりを作る
    const puffCount = 3 + Math.floor(rand() * 3);
    for (let j = 0; j < puffCount; j++) {
      const puff = new THREE.Mesh(puffGeometry, cloudMaterial);
      const size = 0.7 + rand() * 0.8;
      puff.scale.set(size, size * 0.55, size * 0.8);
      puff.position.set((j - (puffCount - 1) / 2) * 0.9, (rand() - 0.5) * 0.25, (rand() - 0.5) * 0.6);
      puff.castShadow = true; // 雲の影が地面をゆっくり流れる
      cloud.add(puff);
    }
    cloud.position.y = 33 + rand() * 3; // 上空の高さ

    // 雲ごとにランダムな軸のまわりを周回させる
    const pivot = new THREE.Object3D();
    pivot.add(cloud);
    scene.add(pivot);
    const baseQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2)
    );
    const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    clouds.push({ pivot, baseQuat, axis, speed: 0.008 + rand() * 0.012 });
  }

  const spinQuat = new THREE.Quaternion();
  return (time: number) => {
    for (const cloud of clouds) {
      // 「初期姿勢 × 軸まわりの回転」を毎回時間から作るので誤差が蓄積しない
      spinQuat.setFromAxisAngle(cloud.axis, time * cloud.speed);
      cloud.pivot.quaternion.copy(spinQuat).multiply(cloud.baseQuat);
    }
  };
}

// --- 蝶 ---

/** 羽ばたきながら惑星の表面近くを飛び回る蝶 */
export function addButterflies(scene: THREE.Scene, rand: Rand): Updater {
  const wingGeometry = new THREE.PlaneGeometry(0.14, 0.1);
  const bodyGeometry = flatGeometry(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 5));

  interface Butterfly {
    root: THREE.Group;
    leftWing: THREE.Group; // 羽ばたき用の回転ピボット
    rightWing: THREE.Group;
    baseLat: number;
    baseLon: number;
    phase: number;
    lonSpeed: number;
  }
  const butterflies: Butterfly[] = [];
  const colors = [PALETTE.butterflyWing, PALETTE.petal, PALETTE.accentPurple];
  for (let i = 0; i < 5; i++) {
    const root = new THREE.Group();
    // 羽は薄い板なので両面描画の専用マテリアルを使う
    // (共有トゥーンマテリアルの side を書き換えると花などへ波及するため)
    const wingMaterial = doubleSidedToonMaterial(colors[i % colors.length]!);

    const body = new THREE.Mesh(bodyGeometry, toonMaterial(PALETTE.eye));
    body.rotation.x = Math.PI / 2; // 体を進行方向(+Z)に寝かせる
    root.add(body);

    // 羽は左右のグループを回転させて羽ばたかせる
    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
    leftWing.rotation.x = -Math.PI / 2;
    leftWing.position.x = -0.075;
    const leftPivot = new THREE.Group();
    leftPivot.add(leftWing);
    root.add(leftPivot);

    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
    rightWing.rotation.x = -Math.PI / 2;
    rightWing.position.x = 0.075;
    const rightPivot = new THREE.Group();
    rightPivot.add(rightWing);
    root.add(rightPivot);

    root.userData.noOutline = true; // 薄い羽は輪郭線のノイズになるので外す
    scene.add(root);
    butterflies.push({
      root,
      leftWing: leftPivot,
      rightWing: rightPivot,
      baseLat: (rand() - 0.5) * 120,
      baseLon: rand() * 360,
      phase: rand() * Math.PI * 2,
      lonSpeed: (rand() < 0.5 ? 1 : -1) * (2.5 + rand() * 2),
    });
  }

  const position = new THREE.Vector3();
  const nextPosition = new THREE.Vector3();

  /** 蝶の飛行経路:緯度・経度・高度を時間のゆらぎで動かす */
  const pathAt = (b: Butterfly, time: number, out: THREE.Vector3) => {
    const lat = b.baseLat + Math.sin(time * 0.11 + b.phase) * 30;
    const lon = b.baseLon + time * b.lonSpeed + Math.sin(time * 0.17 + b.phase) * 25;
    const altitude = 0.8 + Math.sin(time * 1.3 + b.phase) * 0.3;
    return out
      .copy(directionFromLatLon(lat, lon))
      .multiplyScalar(PLANET_RADIUS + altitude);
  };

  return (time: number) => {
    for (const b of butterflies) {
      pathAt(b, time, position);
      pathAt(b, time + 0.12, nextPosition); // 少し先の位置から進行方向を求める
      b.root.position.copy(position);
      // 上方向をその地点の球面法線に合わせてから、進行方向を向く
      b.root.up.copy(position).normalize();
      b.root.lookAt(nextPosition);
      // 羽ばたき
      const flap = 0.25 + Math.sin(time * 14 + b.phase) * 0.85;
      b.leftWing.rotation.z = flap;
      b.rightWing.rotation.z = -flap;
    }
  };
}

// --- 流れ星 ---

/** ときどき夜空を横切る流れ星 */
export function addShootingStars(scene: THREE.Scene, rand: Rand): Updater {
  const meteor = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 9),
    new THREE.MeshBasicMaterial({
      color: PALETTE.meteor,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  meteor.visible = false;
  scene.add(meteor);

  const RADIUS = 260; // 星空(350〜450)より手前、雲より遥か上
  const DURATION = 1.1;
  let nextAt = 4;
  let startTime = -1;
  const dirA = new THREE.Vector3();
  const dirB = new THREE.Vector3();
  const position = new THREE.Vector3();
  const nextPos = new THREE.Vector3();

  /** 大円上の位置(dirAから dirB方向へ angle ラジアン進んだ点) */
  const arcAt = (angle: number, out: THREE.Vector3) =>
    out
      .copy(dirA)
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(dirB, Math.sin(angle))
      .multiplyScalar(RADIUS);

  return (time: number) => {
    if (startTime < 0 && time >= nextAt) {
      // 出現:ランダムな開始点と、それに直交する進行方向を選ぶ
      startTime = time;
      dirA.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
      // ランダムなベクトルから dirA 成分を取り除いて直交化する
      dirB.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      dirB.addScaledVector(dirA, -dirB.dot(dirA)).normalize();
      meteor.visible = true;
    }
    if (startTime >= 0) {
      const s = (time - startTime) / DURATION;
      if (s >= 1) {
        startTime = -1;
        meteor.visible = false;
        nextAt = time + 6 + rand() * 10;
      } else {
        arcAt(s * 0.35, position);
        arcAt(s * 0.35 + 0.02, nextPos);
        meteor.position.copy(position);
        meteor.lookAt(nextPos); // 進行方向に長い辺を向ける
        (meteor.material as THREE.MeshBasicMaterial).opacity =
          Math.sin(s * Math.PI) * 0.9; // ふっと現れて消える
      }
    }
  };
}
