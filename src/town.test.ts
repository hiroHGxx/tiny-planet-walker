import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PLANET_RADIUS } from './palette.ts';
import { moveToward } from './town.ts';
import { ROAD_ARCS, LAKES } from './world.ts';

describe('町のレイアウト', () => {
  it('moveTowardは指定した角度だけ進んだ単位ベクトルを返す', () => {
    const from = new THREE.Vector3(0, 1, 0);
    const toward = new THREE.Vector3(1, 0, 0);
    const moved = moveToward(from, toward, 0.3);
    expect(moved.length()).toBeCloseTo(1, 6);
    expect(moved.angleTo(from)).toBeCloseTo(0.3, 6);
  });

  it('すべての道の弧は湖(砂の縁+道幅)へ入り込まない', () => {
    for (const [from, to] of ROAD_ARCS) {
      const axis = new THREE.Vector3().crossVectors(from, to).normalize();
      const arcAngle = from.angleTo(to);
      // 弧に沿って細かくサンプリングして、各湖からの距離を確認する
      for (let i = 0; i <= 50; i++) {
        const point = from.clone().applyAxisAngle(axis, (arcAngle * i) / 50);
        for (const lake of LAKES) {
          const distance = point.angleTo(lake.direction) * PLANET_RADIUS;
          // クリアランスは radius*1.18+1.4。数値誤差ぶんだけ緩めて検証する
          expect(distance).toBeGreaterThanOrEqual(lake.radius * 1.18 + 0.9);
        }
      }
    }
  });
});
