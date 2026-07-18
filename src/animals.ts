import * as THREE from 'three';
import {
  PALETTE,
  PLANET_RADIUS,
  toonMaterial,
  doubleSidedToonMaterial,
  flatGeometry,
} from './palette.ts';
import { resolveCollisions } from './collision.ts';

/**
 * 星の動物たち:地上をうろつく小動物(鳥・うさぎ・ひつじ)と、
 * 飛び回る虫(ハチ・トンボ)。
 *
 * 地上の動物はNPCと同じルールベース(待機⇔うろつき)で動き、
 * 虫は時間の関数で決まる経路を飛ぶ。
 * どちらもプレイヤーから遠い(地平線の向こう)ときは
 * 描画も更新も止めて負荷を抑える。
 */

type Rand = () => number;

/** プレイヤー方向とのdotがこれ未満なら遠いので止める */
const ACTIVE_DOT = 0.45;

// 使い回し用の一時オブジェクト
const _up = new THREE.Vector3();
const _jitter = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _stepQuat = new THREE.Quaternion();
const _lookMatrix = new THREE.Matrix4();
const _dir = new THREE.Vector3();
const _nextPos = new THREE.Vector3();

// --- 地上の動物 ---

interface AnimalSpec {
  /** 歩く速さ(単位/秒) */
  speed: number;
  /** 跳ねる高さ(0なら歩く) */
  hopHeight: number;
  /** 足踏み・跳ねの速さ */
  gaitFrequency: number;
  /** うろつく範囲(ラジアン) */
  wanderRadius: number;
}

class GroundAnimal {
  readonly mesh: THREE.Group;
  private readonly body: THREE.Group;
  private readonly spec: AnimalSpec;
  private gaitPhase = 0;
  private bobStrength = 0;
  private elapsed = 0;
  private lastTime = -1;
  private state: 'idle' | 'walk' = 'idle';
  private idleTimer: number;
  private stuckTimer = 0;
  private readonly lastProgressPosition = new THREE.Vector3();
  private readonly rand: Rand;
  private readonly home: THREE.Vector3;
  private readonly target = new THREE.Vector3();
  private readonly desiredQuat = new THREE.Quaternion();

  constructor(body: THREE.Group, spec: AnimalSpec, homeDirection: THREE.Vector3, rand: Rand) {
    this.rand = rand;
    this.spec = spec;
    this.home = homeDirection.clone().normalize();
    this.body = body;
    this.mesh = new THREE.Group();
    this.mesh.add(body);
    this.mesh.position.copy(this.home).multiplyScalar(PLANET_RADIUS);

    _up.copy(this.home);
    _tangent.set(0, 1, 0).cross(_up);
    if (_tangent.lengthSq() < 1e-6) _tangent.set(1, 0, 0);
    _tangent.normalize();
    this.faceTowards(_tangent);
    this.mesh.quaternion.copy(this.desiredQuat);
    this.idleTimer = rand() * 4;
  }

  private faceTowards(tangent: THREE.Vector3): void {
    _lookTarget.copy(this.mesh.position).add(tangent);
    _lookMatrix.lookAt(this.mesh.position, _lookTarget, _up);
    this.desiredQuat.setFromRotationMatrix(_lookMatrix);
  }

  private startWalking(): void {
    for (let attempt = 0; attempt < 8; attempt++) {
      _jitter
        .set(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5)
        .multiplyScalar(2 * this.spec.wanderRadius);
      this.target.copy(this.home).add(_jitter).normalize();
      _up.copy(this.mesh.position).normalize();
      if (_up.dot(this.target) < Math.cos(0.02)) {
        this.state = 'walk';
        this.stuckTimer = 0;
        this.lastProgressPosition.copy(this.mesh.position);
        return;
      }
    }
    this.idleTimer = 1;
  }

  update(time: number, playerDirection: THREE.Vector3): void {
    const deltaTime = this.lastTime < 0 ? 0 : Math.min(time - this.lastTime, 0.1);
    this.lastTime = time;

    const position = this.mesh.position;
    _up.copy(position).normalize();

    // 距離カリング:遠くの動物は描画も更新も止める
    const near = _up.dot(playerDirection) > ACTIVE_DOT;
    this.mesh.visible = near;
    if (!near || deltaTime <= 0) return;

    let moving = false;

    if (this.state === 'idle') {
      this.idleTimer -= deltaTime;
      if (this.idleTimer <= 0) this.startWalking();
    } else {
      const cosAngle = THREE.MathUtils.clamp(_up.dot(this.target), -1, 1);
      const angleToTarget = Math.acos(cosAngle);
      _axis.crossVectors(_up, this.target);
      if (angleToTarget < 0.008 || _axis.lengthSq() < 1e-8) {
        this.state = 'idle';
        this.idleTimer = 2 + this.rand() * 6;
      } else {
        _axis.normalize();
        const step = Math.min((this.spec.speed * deltaTime) / PLANET_RADIUS, angleToTarget);
        _stepQuat.setFromAxisAngle(_axis, step);
        position.applyQuaternion(_stepQuat);
        resolveCollisions(position, 0.2);
        moving = true;

        _up.copy(position).normalize();
        _tangent.crossVectors(_axis, _up).normalize();
        this.faceTowards(_tangent);

        // スタック検知(障害物に阻まれたらあきらめる)
        this.stuckTimer += deltaTime;
        if (this.stuckTimer >= 0.7) {
          const progressed = position.distanceTo(this.lastProgressPosition);
          if (progressed < this.spec.speed * this.stuckTimer * 0.4) {
            this.state = 'idle';
            this.idleTimer = 0.5 + this.rand();
          }
          this.stuckTimer = 0;
          this.lastProgressPosition.copy(position);
        }
      }
    }

    this.mesh.quaternion.slerp(this.desiredQuat, 1 - Math.exp(-8 * deltaTime));

    // 跳ねる/歩くアニメーション(見た目専用の内側グループを揺らす)
    this.elapsed += deltaTime;
    const smoothing = 1 - Math.exp(-8 * deltaTime);
    this.bobStrength += ((moving ? 1 : 0) - this.bobStrength) * smoothing;
    if (moving) this.gaitPhase += deltaTime * this.spec.gaitFrequency;
    this.body.position.y =
      Math.abs(Math.sin(this.gaitPhase)) * this.spec.hopHeight * this.bobStrength +
      Math.sin(this.elapsed * 1.8) * 0.01 * (1 - this.bobStrength);
    this.body.rotation.x = -Math.sin(this.gaitPhase * 2) * 0.06 * this.bobStrength;
  }
}

// --- 動物の見た目(ジオメトリはモジュール内で共有) ---

const smallSphere = flatGeometry(new THREE.SphereGeometry(1, 7, 5));
const tinySphere = flatGeometry(new THREE.SphereGeometry(1, 5, 4));
const beakGeometry = flatGeometry(new THREE.ConeGeometry(0.03, 0.07, 5));
const legStickGeometry = flatGeometry(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 5));
const eyeMaterial = () => toonMaterial(PALETTE.eye);

/** 小鳥(丸い体+くちばし+ちょこんとした尾) */
function buildBird(rand: Rand): THREE.Group {
  const root = new THREE.Group();
  const colors = [PALETTE.petal, PALETTE.flowerCenter, PALETTE.accentRed, PALETTE.butterflyWing];
  const bodyColor = toonMaterial(colors[Math.floor(rand() * colors.length)]!);

  const body = new THREE.Mesh(smallSphere, bodyColor);
  body.scale.set(0.12, 0.11, 0.14);
  body.position.y = 0.12;
  root.add(body);
  const head = new THREE.Mesh(smallSphere, bodyColor);
  head.scale.setScalar(0.085);
  head.position.set(0, 0.22, -0.08);
  root.add(head);
  const beak = new THREE.Mesh(beakGeometry, toonMaterial(PALETTE.lantern));
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.21, -0.18);
  root.add(beak);
  const tail = new THREE.Mesh(smallSphere, bodyColor);
  tail.scale.set(0.04, 0.02, 0.09);
  tail.position.set(0, 0.16, 0.15);
  tail.rotation.x = 0.5;
  root.add(tail);
  for (const x of [-0.035, 0.035]) {
    const eye = new THREE.Mesh(tinySphere, eyeMaterial());
    eye.scale.setScalar(0.016);
    eye.position.set(x, 0.235, -0.148);
    root.add(eye);
  }
  root.scale.setScalar(0.9 + rand() * 0.3);
  return root;
}

/** うさぎ(丸い体+長い耳+白い尾) */
function buildRabbit(rand: Rand): THREE.Group {
  const root = new THREE.Group();
  const colors = [PALETTE.petal, PALETTE.cloud, PALETTE.trunk];
  const bodyColor = toonMaterial(colors[Math.floor(rand() * colors.length)]!);

  const body = new THREE.Mesh(smallSphere, bodyColor);
  body.scale.set(0.13, 0.12, 0.16);
  body.position.y = 0.13;
  root.add(body);
  const head = new THREE.Mesh(smallSphere, bodyColor);
  head.scale.setScalar(0.1);
  head.position.set(0, 0.27, -0.08);
  root.add(head);
  for (const x of [-0.045, 0.045]) {
    const ear = new THREE.Mesh(smallSphere, bodyColor);
    ear.scale.set(0.03, 0.11, 0.02);
    ear.position.set(x, 0.43, -0.06);
    ear.rotation.z = -x * 3;
    root.add(ear);
    const eye = new THREE.Mesh(tinySphere, eyeMaterial());
    eye.scale.setScalar(0.018);
    eye.position.set(x, 0.28, -0.17);
    root.add(eye);
  }
  const tail = new THREE.Mesh(smallSphere, toonMaterial(PALETTE.petal));
  tail.scale.setScalar(0.045);
  tail.position.set(0, 0.14, 0.16);
  root.add(tail);
  root.scale.setScalar(0.9 + rand() * 0.3);
  return root;
}

/** ひつじ(もこもこの体+短い脚) */
function buildSheep(rand: Rand): THREE.Group {
  const root = new THREE.Group();
  const wool = toonMaterial(PALETTE.cloud);
  const face = toonMaterial(PALETTE.trunk);

  const body = new THREE.Mesh(smallSphere, wool);
  body.scale.set(0.19, 0.16, 0.24);
  body.position.y = 0.26;
  root.add(body);
  const topWool = new THREE.Mesh(smallSphere, wool);
  topWool.scale.setScalar(0.11);
  topWool.position.set(0, 0.4, 0.02);
  root.add(topWool);
  const head = new THREE.Mesh(smallSphere, face);
  head.scale.set(0.08, 0.09, 0.1);
  head.position.set(0, 0.3, -0.26);
  root.add(head);
  for (const x of [-0.07, 0.07]) {
    const ear = new THREE.Mesh(smallSphere, face);
    ear.scale.set(0.045, 0.02, 0.025);
    ear.position.set(x, 0.34, -0.24);
    root.add(ear);
    const eye = new THREE.Mesh(tinySphere, eyeMaterial());
    eye.scale.setScalar(0.016);
    eye.position.set(x * 0.55, 0.32, -0.34);
    root.add(eye);
  }
  const legMaterial = toonMaterial(PALETTE.boots);
  for (const [x, z] of [
    [-0.1, -0.12],
    [0.1, -0.12],
    [-0.1, 0.14],
    [0.1, 0.14],
  ]) {
    const leg = new THREE.Mesh(legStickGeometry, legMaterial);
    leg.position.set(x!, 0.08, z!);
    root.add(leg);
  }
  root.scale.setScalar(0.9 + rand() * 0.35);
  return root;
}

// --- 飛ぶ虫(ハチ・トンボ) ---

interface Insect {
  root: THREE.Group;
  /** 現在時刻の経路上の位置だけを計算する(可視判定用の軽量版) */
  positionAt: (time: number, out: THREE.Vector3) => THREE.Vector3;
  update: (time: number) => void;
}

/** ハチ:花の高さで小さな円を描いて飛ぶ。羽は高速ではばたく */
function createBee(rand: Rand): Insect {
  const root = new THREE.Group();
  root.userData.noOutline = true; // 小さすぎて輪郭線はノイズになる

  const body = new THREE.Mesh(smallSphere, toonMaterial(PALETTE.flowerCenter));
  body.scale.set(0.045, 0.04, 0.065);
  root.add(body);
  const stripe = new THREE.Mesh(smallSphere, toonMaterial(PALETTE.eye));
  stripe.scale.set(0.047, 0.042, 0.018);
  stripe.position.z = 0.015;
  root.add(stripe);
  // 羽は両面描画の専用マテリアル(共有マテリアルを書き換えない)
  const wingMaterial = doubleSidedToonMaterial(PALETTE.cloud);
  const wings: THREE.Mesh[] = [];
  for (const x of [-0.05, 0.05]) {
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.045), wingMaterial);
    wing.position.set(x, 0.03, 0);
    wing.rotation.x = -Math.PI / 2;
    root.add(wing);
    wings.push(wing);
  }

  // 巣(基準点)のまわりを回る経路
  const base = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
  const reference = Math.abs(base.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const tangentA = new THREE.Vector3().crossVectors(base, reference).normalize();
  const tangentB = new THREE.Vector3().crossVectors(base, tangentA).normalize();
  const altitude = 0.5 + rand() * 0.4;
  const radius = 0.3 + rand() * 0.4;
  const speed = 1.6 + rand() * 1.2;
  const phase = rand() * Math.PI * 2;

  const pathAt = (t: number, out: THREE.Vector3) => {
    const angle = t * speed + phase;
    return out
      .copy(base)
      .multiplyScalar(PLANET_RADIUS + altitude + Math.sin(angle * 1.7) * 0.12)
      .addScaledVector(tangentA, Math.cos(angle) * radius)
      .addScaledVector(tangentB, Math.sin(angle) * radius);
  };

  return {
    root,
    positionAt: pathAt,
    update: (time: number) => {
      pathAt(time, root.position);
      pathAt(time + 0.1, _nextPos);
      root.up.copy(root.position).normalize();
      root.lookAt(_nextPos);
      const flap = Math.sin(time * 45) * 0.7;
      wings[0]!.rotation.z = flap;
      wings[1]!.rotation.z = -flap;
    },
  };
}

/** トンボ:細長い体で、蝶より高く速く、すーっと直線的に飛ぶ */
function createDragonfly(rand: Rand): Insect {
  const root = new THREE.Group();
  root.userData.noOutline = true;

  const colors = [PALETTE.accentPurple, PALETTE.glowBerry, PALETTE.fill];
  const body = new THREE.Mesh(
    flatGeometry(new THREE.CylinderGeometry(0.012, 0.008, 0.2, 5)),
    toonMaterial(colors[Math.floor(rand() * colors.length)]!)
  );
  body.rotation.x = Math.PI / 2; // 体を進行方向(+Z)に寝かせる
  root.add(body);
  const head = new THREE.Mesh(tinySphere, eyeMaterial());
  head.scale.setScalar(0.022);
  head.position.z = -0.11;
  root.add(head);
  // 羽は両面描画の専用マテリアル(共有マテリアルを書き換えない)
  const wingMaterial = doubleSidedToonMaterial(PALETTE.cloud);
  const wings: THREE.Mesh[] = [];
  for (const [x, z] of [
    [-0.06, -0.03],
    [0.06, -0.03],
    [-0.055, 0.02],
    [0.055, 0.02],
  ]) {
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.03), wingMaterial);
    wing.position.set(x!, 0.01, z!);
    wing.rotation.x = -Math.PI / 2;
    root.add(wing);
    wings.push(wing);
  }

  const baseLat = (rand() - 0.5) * 120;
  const baseLon = rand() * 360;
  const lonSpeed = (rand() < 0.5 ? 1 : -1) * (5 + rand() * 3);
  const phase = rand() * Math.PI * 2;

  const pathAt = (t: number, out: THREE.Vector3) => {
    const lat = baseLat + Math.sin(t * 0.13 + phase) * 25;
    const lon = baseLon + t * lonSpeed + Math.sin(t * 0.31 + phase) * 10;
    const altitude = 1.1 + Math.sin(t * 0.9 + phase) * 0.35;
    const latRad = (lat * Math.PI) / 180;
    const lonRad = (lon * Math.PI) / 180;
    return out
      .set(
        Math.cos(latRad) * Math.cos(lonRad),
        Math.sin(latRad),
        Math.cos(latRad) * Math.sin(lonRad)
      )
      .multiplyScalar(PLANET_RADIUS + altitude);
  };

  return {
    root,
    positionAt: pathAt,
    update: (time: number) => {
      pathAt(time, root.position);
      pathAt(time + 0.08, _nextPos);
      root.up.copy(root.position).normalize();
      root.lookAt(_nextPos);
      const flap = 0.15 + Math.sin(time * 30) * 0.35;
      wings[0]!.rotation.z = flap;
      wings[1]!.rotation.z = -flap;
      wings[2]!.rotation.z = -flap * 0.8;
      wings[3]!.rotation.z = flap * 0.8;
    },
  };
}

// --- まとめて生成・更新 ---

/**
 * 動物と虫をまとめてシーンに追加する。
 * 戻り値は毎フレームの更新関数(プレイヤーの方向で遠くの個体を止める)。
 */
export type AnimalKind = 'bird' | 'rabbit' | 'sheep';

/** なでる・毛を刈るの対象として外へ見せる動物の情報 */
export interface WildAnimal {
  mesh: THREE.Group;
  kind: AnimalKind;
}

export function addWildlife(
  scene: THREE.Scene,
  rand: Rand,
  avoidDirections: Array<{ direction: THREE.Vector3; minDot: number }>,
  pastures: Array<{ direction: THREE.Vector3; count: number }> = []
): {
  update: (time: number, playerDirection: THREE.Vector3) => void;
  animals: ReadonlyArray<WildAnimal>;
} {
  // 地上の動物:鳥・うさぎ・ひつじを6体ずつ
  const specs: Array<[(r: Rand) => THREE.Group, AnimalSpec, AnimalKind]> = [
    [buildBird, { speed: 1.1, hopHeight: 0.09, gaitFrequency: 11, wanderRadius: 0.09 }, 'bird'],
    [buildRabbit, { speed: 1.7, hopHeight: 0.12, gaitFrequency: 9, wanderRadius: 0.1 }, 'rabbit'],
    [buildSheep, { speed: 0.7, hopHeight: 0.02, gaitFrequency: 6, wanderRadius: 0.07 }, 'sheep'],
  ];
  const animals: GroundAnimal[] = [];
  const exposed: WildAnimal[] = [];
  for (const [build, spec, kind] of specs) {
    let placed = 0;
    let attempts = 0;
    while (placed < 6 && attempts < 100) {
      attempts++;
      const home = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      if (home.lengthSq() < 0.01) continue;
      home.normalize();
      // 開始地点や薬屋の真上は避ける
      if (avoidDirections.some((a) => home.dot(a.direction) > a.minDot)) continue;
      const animal = new GroundAnimal(build(rand), spec, home, rand);
      scene.add(animal.mesh);
      animals.push(animal);
      exposed.push({ mesh: animal.mesh, kind });
      placed++;
    }
  }

  // 柵の中の家畜(ひつじ)。うろつき範囲を柵より小さくして外へ出ないようにする
  for (const pasture of pastures) {
    for (let i = 0; i < pasture.count; i++) {
      const home = pasture.direction
        .clone()
        .add(
          new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.04)
        )
        .normalize();
      const sheep = new GroundAnimal(
        buildSheep(rand),
        { speed: 0.55, hopHeight: 0.02, gaitFrequency: 6, wanderRadius: 0.035 },
        home,
        rand
      );
      scene.add(sheep.mesh);
      animals.push(sheep);
      exposed.push({ mesh: sheep.mesh, kind: 'sheep' });
    }
  }

  // 飛ぶ虫:ハチとトンボを6匹ずつ
  const insects: Insect[] = [];
  for (let i = 0; i < 6; i++) insects.push(createBee(rand));
  for (let i = 0; i < 6; i++) insects.push(createDragonfly(rand));
  for (const insect of insects) {
    insect.update(0);
    scene.add(insect.root);
  }

  const update = (time: number, playerDirection: THREE.Vector3) => {
    for (const animal of animals) animal.update(time, playerDirection);
    for (const insect of insects) {
      // 「現在時刻の経路上の位置」で可視判定する。
      // 前回描画時の古い位置で判定すると、非表示中に経路が進んだとき
      // 実際の位置とずれて、再表示されない・突然ワープする、が起きる
      insect.positionAt(time, _dir).normalize();
      const near = _dir.dot(playerDirection) > ACTIVE_DOT;
      insect.root.visible = near;
      if (near) insect.update(time); // 姿勢・羽の更新は見えるときだけ
    }
  };
  return { update, animals: exposed };
}
