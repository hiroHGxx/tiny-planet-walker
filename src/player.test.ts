import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Player } from './player.ts';

/**
 * 球面移動の数値テスト。
 * カメラの平行移動(前の法線 → 今の法線への最小回転で視線方向を運ぶ)を
 * テスト内でも再現しながら、長時間歩いても破綻しないことを確認する。
 */
describe('球面移動', () => {
  it('一周以上歩いても半径25を維持し、姿勢のノルムが1のまま(極通過を含む)', () => {
    const player = new Player();
    const viewForward = new THREE.Vector3(0, 0, -1);
    const up = new THREE.Vector3(0, 1, 0);
    const previousUp = up.clone();
    const transport = new THREE.Quaternion();

    // 60fps相当 × 2200フレーム ≈ 36秒 = 一周(約26秒)以上。
    // 開始地点は北極なので、途中で必ず両極に相当する場所を通る
    for (let frame = 0; frame < 2200; frame++) {
      player.update(1 / 60, { x: 0, z: 1 }, viewForward);

      // カメラと同じ方法で視線方向を平行移動する
      up.copy(player.mesh.position).normalize();
      transport.setFromUnitVectors(previousUp, up);
      viewForward.applyQuaternion(transport);
      viewForward.addScaledVector(up, -viewForward.dot(up)).normalize();
      previousUp.copy(up);

      const radius = player.mesh.position.length();
      expect(radius).toBeGreaterThan(24.999);
      expect(radius).toBeLessThan(25.001);
    }

    const q = player.mesh.quaternion;
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 6);
  });

  it('横移動(A/D)でも半径が変わらない', () => {
    const player = new Player();
    const viewForward = new THREE.Vector3(0, 0, -1);
    for (let frame = 0; frame < 300; frame++) {
      player.update(1 / 60, { x: 1, z: 0 }, viewForward);
    }
    expect(player.mesh.position.length()).toBeCloseTo(25, 3);
  });
});
