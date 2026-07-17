import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PLANET_RADIUS } from './palette.ts';
import { addCollider, resolveCollisions } from './collision.ts';

/** 位置と障害物中心の表面距離(大円距離) */
function surfaceDistance(position: THREE.Vector3, direction: THREE.Vector3): number {
  const cosAngle = THREE.MathUtils.clamp(
    position.clone().normalize().dot(direction),
    -1,
    1
  );
  return Math.acos(cosAngle) * PLANET_RADIUS;
}

describe('球面上の衝突解決', () => {
  it('障害物の円に入った位置が外へ押し出され、半径は変わらない', () => {
    const center = new THREE.Vector3(1, 0, 0).normalize();
    const collider = addCollider(center, 1);
    // 障害物の中心から0.5(円の内側)の位置
    const position = center
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5 / PLANET_RADIUS)
      .multiplyScalar(PLANET_RADIUS);

    resolveCollisions(position, 0.35);

    expect(surfaceDistance(position, collider.direction)).toBeGreaterThanOrEqual(
      1 + 0.35 - 1e-6
    );
    expect(position.length()).toBeCloseTo(PLANET_RADIUS, 6);
  });

  it('密集した障害物でも、反復解決ですべての円の外へ出る', () => {
    // 押し出し先に別の障害物がある配置(1回の走査では入り直す)
    const axis = new THREE.Vector3(0, 0, 1);
    const a = new THREE.Vector3(0, 1, 0).applyAxisAngle(axis, 0.02).normalize();
    const b = new THREE.Vector3(0, 1, 0).applyAxisAngle(axis, -0.02).normalize();
    const colliderA = addCollider(a, 0.8);
    const colliderB = addCollider(b, 0.8);

    // 2つの障害物の中間(両方の円の内側)
    const position = new THREE.Vector3(0, 1, 0).multiplyScalar(PLANET_RADIUS);
    resolveCollisions(position, 0.3);

    expect(surfaceDistance(position, colliderA.direction)).toBeGreaterThanOrEqual(
      0.8 + 0.3 - 1e-6
    );
    expect(surfaceDistance(position, colliderB.direction)).toBeGreaterThanOrEqual(
      0.8 + 0.3 - 1e-6
    );
    expect(position.length()).toBeCloseTo(PLANET_RADIUS, 6);
  });
});
