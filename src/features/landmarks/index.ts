import * as THREE from 'three';
import { PALETTE, toonMaterial, flatGeometry } from '../../palette.ts';
import { PLANET_RADIUS, VILLAGE_CENTERS, LAKES } from '../../world.ts';
import { addCollider } from '../../collision.ts';
import { moveToward } from '../../town.ts';
import type { Feature, FeatureContext } from '../feature.ts';

/**
 * 景観の構造物(F18の残り)。風車・鐘つき塔・湖の桟橋。
 * 風車の羽根はゆっくり回り、鐘つき塔は朝(日付が変わる瞬間)に鐘が鳴る。
 * どれも眺めるためのもので、遊びの機能は持たない。
 */

const WINDMILL_DIRECTION = new THREE.Vector3(-0.2, 0.62, 0.79).normalize();

let blades: THREE.Group | null = null;

export const landmarksFeature: Feature = {
  id: 'landmarks',
  setup(ctx: FeatureContext): void {
    // --- 風車(丘のふもとの粉ひき小屋) ---
    const windmill = new THREE.Group();
    const tower = new THREE.Mesh(
      flatGeometry(new THREE.CylinderGeometry(0.7, 0.95, 2.6, 8)),
      toonMaterial(PALETTE.wall)
    );
    tower.position.y = 1.3;
    windmill.add(tower);
    const roof = new THREE.Mesh(
      flatGeometry(new THREE.ConeGeometry(0.9, 0.8, 8)),
      toonMaterial(PALETTE.roof)
    );
    roof.position.y = 3.0;
    windmill.add(roof);
    blades = new THREE.Group();
    blades.position.set(0, 2.4, 0.95);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(
        flatGeometry(new THREE.BoxGeometry(0.22, 1.5, 0.05)),
        toonMaterial(PALETTE.petal)
      );
      blade.position.y = 0.8;
      const arm = new THREE.Group();
      arm.add(blade);
      arm.rotation.z = (i / 4) * Math.PI * 2;
      blades.add(arm);
    }
    windmill.add(blades);
    windmill.position.copy(WINDMILL_DIRECTION).multiplyScalar(PLANET_RADIUS);
    windmill.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), WINDMILL_DIRECTION);
    ctx.scene.add(windmill);
    addCollider(WINDMILL_DIRECTION, 1.0);

    // --- 鐘つき塔(裏側の村。ガタさんの夢の続き) ---
    const towerDirection = VILLAGE_CENTERS[2]!.clone()
      .add(new THREE.Vector3(-0.06, 0.03, -0.05))
      .normalize();
    const bellTower = new THREE.Group();
    for (const [px, pz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
      const pillar = new THREE.Mesh(
        flatGeometry(new THREE.BoxGeometry(0.16, 2.4, 0.16)),
        toonMaterial(PALETTE.trunk)
      );
      pillar.position.set(px!, 1.2, pz!);
      bellTower.add(pillar);
    }
    const bellRoof = new THREE.Mesh(
      flatGeometry(new THREE.ConeGeometry(0.85, 0.6, 4)),
      toonMaterial(PALETTE.roof)
    );
    bellRoof.position.y = 2.7;
    bellRoof.rotation.y = Math.PI / 4;
    bellTower.add(bellRoof);
    const bell = new THREE.Mesh(
      flatGeometry(new THREE.ConeGeometry(0.3, 0.45, 8)),
      toonMaterial(PALETTE.flowerCenter, 0x5a4a10)
    );
    bell.position.y = 2.05;
    bellTower.add(bell);
    bellTower.position.copy(towerDirection).multiplyScalar(PLANET_RADIUS);
    bellTower.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), towerDirection);
    ctx.scene.add(bellTower);
    addCollider(towerDirection, 0.7);

    // 朝が来たら鐘が鳴る(日数の時計と接続)
    ctx.events.on('day-passed', () => ctx.audio.playJingle('bell'));

    // --- 桟橋(大きい湖のほとり。ロコじいさんの釣り場のそば) ---
    const shoreDirection = moveToward(
      LAKES[0]!.direction.clone(),
      VILLAGE_CENTERS[1]!,
      (LAKES[0]!.radius - 0.3) / PLANET_RADIUS
    );
    const toLake = new THREE.Vector3()
      .crossVectors(
        new THREE.Vector3().crossVectors(shoreDirection, LAKES[0]!.direction),
        shoreDirection
      )
      .normalize(); // 岸から湖の中心へ向かう接線
    const pier = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const plank = new THREE.Mesh(
        flatGeometry(new THREE.BoxGeometry(0.9, 0.08, 0.55)),
        toonMaterial(PALETTE.wood)
      );
      plank.position.set(0, 0.28, -0.3 - i * 0.58);
      pier.add(plank);
      if (i % 2 === 0) {
        for (const side of [-0.38, 0.38]) {
          const pile = new THREE.Mesh(
            flatGeometry(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 6)),
            toonMaterial(PALETTE.trunk)
          );
          pile.position.set(side, 0.05, -0.3 - i * 0.58);
          pier.add(pile);
        }
      }
    }
    pier.position.copy(shoreDirection).multiplyScalar(PLANET_RADIUS);
    pier.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shoreDirection);
    // 桟橋のローカル-Zを「湖の中心向き」へ合わせる
    const localForward = new THREE.Vector3(0, 0, -1).applyQuaternion(pier.quaternion);
    const yaw = Math.atan2(
      new THREE.Vector3().crossVectors(localForward, toLake).dot(shoreDirection),
      localForward.dot(toLake)
    );
    pier.rotateY(yaw);
    ctx.scene.add(pier);
  },
  update(deltaTime: number): void {
    // 風車の羽根はゆっくり回り続ける
    if (blades) blades.rotation.z += deltaTime * 0.5;
  },
};
