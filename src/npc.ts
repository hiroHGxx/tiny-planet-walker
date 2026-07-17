import * as THREE from 'three';
import {
  PALETTE,
  PLANET_RADIUS,
  toonMaterial,
  flatGeometry,
  getGradientMap,
} from './palette.ts';
import { addCollider, resolveCollisions, type SurfaceCollider } from './collision.ts';

/**
 * 薬草星の住人NPC。ルールベースAIで動く。
 *
 * ルール:
 * - 待機(1.5〜5秒):ときどきその場で別の方向をゆっくり向く(キョロキョロ)
 * - 散歩:家のまわりのランダムな地点へ、毎回すこし違う速さで歩く
 * - 進めていないと気づいたら(障害物に阻まれている)、あきらめて別の行き先を選ぶ
 * - プレイヤーから遠い(地平線の向こう)ときは、描画も思考も止めて休む
 *
 * 見た目はおえんちゃんと同じ約2.5頭身の積み木人形。
 * 服・帽子・髪は個体ごとにランダムで、絵本の村人たちになる。
 */

type Rand = () => number;

const BASE_WALK_SPEED = 1.5; // 歩く速さの基準(単位/秒)。散歩ごとに少しゆらす
const COLLIDER_RADIUS = 0.3; // 障害物押し出しに使う自身の半径
const WANDER_RADIUS = 0.06; // 家からうろつく範囲(ラジアン ≈ 表面距離1.5)
const TURN_RESPONSIVENESS = 8; // 向きを変える速さ
const STUCK_CHECK_INTERVAL = 0.7; // 進めているかを確認する間隔(秒)
/** プレイヤー方向とのdotがこれ未満なら遠い(≈60°以上)ので止める */
const ACTIVE_DOT = 0.5;

// 使い回し用の一時オブジェクト
const _up = new THREE.Vector3();
const _jitter = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _stepQuat = new THREE.Quaternion();
const _lookMatrix = new THREE.Matrix4();

interface VillagerLimbs {
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

export class Npc {
  readonly mesh: THREE.Group;
  /** 見た目の揺れ専用の内側グループ(位置・姿勢の計算には使わない) */
  private readonly body: THREE.Group;
  private readonly limbs: VillagerLimbs;
  private walkPhase = 0;
  private bobStrength = 0;
  private elapsed = 0;
  /** 前回updateの時刻。ワールドの更新は経過時間しか来ないので差分を取る */
  private lastTime = -1;
  private state: 'idle' | 'walk' = 'idle';
  private idleTimer: number;
  /** 待機中にキョロキョロするまでの時間 */
  private lookAroundTimer: number;
  /** 今回の散歩の歩く速さ */
  private walkSpeed = BASE_WALK_SPEED;
  /** 進めているかの確認用 */
  private stuckTimer = 0;
  private readonly lastProgressPosition = new THREE.Vector3();
  private readonly rand: Rand;
  private readonly home: THREE.Vector3;
  private readonly target = new THREE.Vector3();
  /** 自分の当たり判定(毎フレーム現在地に追従させる) */
  private readonly collider: SurfaceCollider;
  private readonly desiredQuat = new THREE.Quaternion();
  /** つぶやきの吹き出しを出す高さ(頭の少し上。体型で変わる) */
  private readonly bubbleHeight: number;

  constructor(homeDirection: THREE.Vector3, rand: Rand) {
    this.rand = rand;
    this.home = homeDirection.clone().normalize();

    const character = buildVillager(rand);
    this.body = character.root;
    this.limbs = character.limbs;
    this.bubbleHeight = this.body.scale.y * 1.5;
    this.mesh = new THREE.Group();
    this.mesh.add(this.body);
    this.mesh.position.copy(this.home).multiplyScalar(PLANET_RADIUS);

    // 初期の向き:家の位置での適当な接線方向を向いておく
    _up.copy(this.home);
    _tangent.set(0, 1, 0).cross(_up);
    if (_tangent.lengthSq() < 1e-6) _tangent.set(1, 0, 0);
    _tangent.normalize();
    this.faceTowards(_tangent);
    this.mesh.quaternion.copy(this.desiredQuat);

    this.idleTimer = 1 + rand() * 3;
    this.lookAroundTimer = 1.5 + rand() * 2.5;
    this.collider = addCollider(this.home, 0.4);
  }

  /**
   * つぶやきの吹き出しのワールド座標(頭の少し上)。out に書き込んで返す。
   * 足元は球面上にあるので、法線方向へ持ち上げるだけでよい
   */
  getBubbleAnchor(out: THREE.Vector3): THREE.Vector3 {
    return out
      .copy(this.mesh.position)
      .normalize()
      .multiplyScalar(PLANET_RADIUS + this.bubbleHeight);
  }

  /** 指定した接線方向を向くよう desiredQuat を更新する */
  private faceTowards(tangent: THREE.Vector3): void {
    _lookTarget.copy(this.mesh.position).add(tangent);
    _lookMatrix.lookAt(this.mesh.position, _lookTarget, _up);
    this.desiredQuat.setFromRotationMatrix(_lookMatrix);
  }

  /** 家のまわりのランダムな地点を次の行き先にして歩き出す */
  private startWalking(): void {
    for (let attempt = 0; attempt < 8; attempt++) {
      _jitter
        .set(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5)
        .multiplyScalar(2 * WANDER_RADIUS);
      this.target.copy(this.home).add(_jitter).normalize();
      // いまいる場所から十分離れていれば採用(その場で足踏みしない)
      _up.copy(this.mesh.position).normalize();
      if (_up.dot(this.target) < Math.cos(0.02)) {
        this.state = 'walk';
        this.walkSpeed = BASE_WALK_SPEED * (0.8 + this.rand() * 0.5); // 散歩ごとにゆらす
        this.stuckTimer = 0;
        this.lastProgressPosition.copy(this.mesh.position);
        return;
      }
    }
    // 良い行き先が見つからなければ、もう少し待機する
    this.rest(1);
  }

  /** 立ち止まって待機状態に入る */
  private rest(duration: number): void {
    this.state = 'idle';
    this.idleTimer = duration;
    this.lookAroundTimer = 1.2 + this.rand() * 2.5;
  }

  update(time: number, playerDirection: THREE.Vector3): void {
    const deltaTime = this.lastTime < 0 ? 0 : Math.min(time - this.lastTime, 0.1);
    this.lastTime = time;

    const position = this.mesh.position;
    _up.copy(position).normalize();

    // --- 距離カリング ---
    // プレイヤーから遠い(地平線の向こうで見えない)ときは、
    // 描画もAIもアニメーションも止めて負荷を抑える
    const near = _up.dot(playerDirection) > ACTIVE_DOT;
    this.mesh.visible = near;
    if (!near || deltaTime <= 0) return;

    let moving = false;

    if (this.state === 'idle') {
      this.idleTimer -= deltaTime;
      this.lookAroundTimer -= deltaTime;
      if (this.idleTimer <= 0) {
        this.startWalking();
      } else if (this.lookAroundTimer <= 0) {
        // キョロキョロ:その場で別の方向をゆっくり向く
        this.lookAroundTimer = 1.2 + this.rand() * 2.5;
        _jitter.set(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5);
        _tangent.copy(_jitter).addScaledVector(_up, -_jitter.dot(_up));
        if (_tangent.lengthSq() > 1e-6) {
          _tangent.normalize();
          this.faceTowards(_tangent);
        }
      }
    } else {
      // 目的地までの大円距離(角度)
      const cosAngle = THREE.MathUtils.clamp(_up.dot(this.target), -1, 1);
      const angleToTarget = Math.acos(cosAngle);
      _axis.crossVectors(_up, this.target);
      if (angleToTarget < 0.008 || _axis.lengthSq() < 1e-8) {
        // 到着。しばらく立ち止まる
        this.rest(1.5 + this.rand() * 3.5);
      } else {
        // 大円に沿って一歩進む(回転なので半径は変わらない)
        _axis.normalize();
        const step = Math.min((this.walkSpeed * deltaTime) / PLANET_RADIUS, angleToTarget);
        _stepQuat.setFromAxisAngle(_axis, step);
        position.applyQuaternion(_stepQuat);
        // 薬屋や小物に食い込んだら押し出す(自分自身の判定は除外)
        resolveCollisions(position, COLLIDER_RADIUS, this.collider);
        moving = true;

        // 移動方向(接線)へ向きを合わせる。上方向は球面法線
        _up.copy(position).normalize();
        _tangent.crossVectors(_axis, _up).normalize();
        this.faceTowards(_tangent);

        // --- スタック検知 ---
        // 一定時間ごとに実際の移動量を確認し、押し出されて
        // ほとんど進めていなければ、あきらめて別の行き先を選ぶ
        this.stuckTimer += deltaTime;
        if (this.stuckTimer >= STUCK_CHECK_INTERVAL) {
          const progressed = position.distanceTo(this.lastProgressPosition);
          if (progressed < this.walkSpeed * this.stuckTimer * 0.4) {
            this.rest(0.6 + this.rand()); // 少し立ち止まってから別の場所へ
          }
          this.stuckTimer = 0;
          this.lastProgressPosition.copy(position);
        }
      }
    }

    // 姿勢は常に目標へ滑らかに寄せる
    this.mesh.quaternion.slerp(this.desiredQuat, 1 - Math.exp(-TURN_RESPONSIVENESS * deltaTime));

    // 当たり判定を現在地へ追従させる(プレイヤーがNPCをすり抜けない)
    this.collider.direction.copy(_up);

    this.updateBodyMotion(deltaTime, moving);
  }

  /** プレイヤーと同じ方式の歩行モーションもどき(見た目専用) */
  private updateBodyMotion(deltaTime: number, moving: boolean): void {
    this.elapsed += deltaTime;
    const smoothing = 1 - Math.exp(-8 * deltaTime);
    this.bobStrength += ((moving ? 1 : 0) - this.bobStrength) * smoothing;
    if (moving) this.walkPhase += deltaTime * 7.5;

    const body = this.body;
    body.position.y =
      Math.abs(Math.sin(this.walkPhase)) * 0.06 * this.bobStrength +
      Math.sin(this.elapsed * 1.4) * 0.018 * (1 - this.bobStrength);
    body.rotation.z = Math.sin(this.walkPhase) * 0.05 * this.bobStrength;
    body.rotation.x = -0.06 * this.bobStrength;

    const swing = Math.sin(this.walkPhase) * this.bobStrength;
    this.limbs.leftLeg.rotation.x = swing * 0.6;
    this.limbs.rightLeg.rotation.x = -swing * 0.6;
    this.limbs.leftArm.rotation.x = -swing * 0.4;
    this.limbs.rightArm.rotation.x = swing * 0.4;
  }
}

// --- 村人の見た目 ---
// 20体分作るので、ジオメトリと顔テクスチャはモジュール内で共有する

const legGeometry = flatGeometry(new THREE.CylinderGeometry(0.055, 0.05, 0.24, 6));
const bootGeometry = flatGeometry(new THREE.BoxGeometry(0.11, 0.07, 0.16));
const armGeometry = flatGeometry(new THREE.CylinderGeometry(0.05, 0.075, 0.18, 6));
const handGeometry = flatGeometry(new THREE.SphereGeometry(0.045, 6, 5));
const torsoGeometry = flatGeometry(new THREE.CylinderGeometry(0.15, 0.24, 0.4, 7));
const apronGeometry = flatGeometry(new THREE.BoxGeometry(0.16, 0.2, 0.02));
const headGeometry = flatGeometry(new THREE.SphereGeometry(0.22, 12, 9));
const hoodGeometry = flatGeometry(new THREE.ConeGeometry(0.24, 0.3, 7));
const capGeometry = flatGeometry(new THREE.SphereGeometry(0.235, 8, 6));
const hairGeometry = flatGeometry(new THREE.SphereGeometry(0.24, 8, 6));

/** 顔テクスチャのマテリアル(全員で1枚を共有する) */
let faceMaterial: THREE.MeshToonMaterial | null = null;
function getFaceMaterial(): THREE.MeshToonMaterial {
  if (!faceMaterial) {
    faceMaterial = new THREE.MeshToonMaterial({
      map: createVillagerFaceTexture(),
      gradientMap: getGradientMap(),
    });
  }
  return faceMaterial;
}

/**
 * 村人の顔テクスチャをCanvasで生成する(おえんちゃんと同じ絵本タッチ)。
 * 球のUVは正面(-Z)= 横0.75 / 頭頂 = キャンバス上端(player.tsと同じ)
 */
function createVillagerFaceTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // テスト実行環境などCanvas 2Dが使えない場合は、無地のテクスチャで代用する
    return new THREE.CanvasTexture(canvas);
  }

  ctx.fillStyle = '#f0cfa4'; // 手足と同じ肌色
  ctx.fillRect(0, 0, W, H);

  const faceX = W * 0.75;
  const eyeY = 240;

  // ほんのり頬の赤み
  ctx.fillStyle = 'rgba(236, 146, 110, 0.25)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(faceX + side * 88, 288, 18, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 丸い黒目 + 白いハイライト
  for (const side of [-1, 1]) {
    const cx = faceX + side * 46;
    ctx.fillStyle = '#40342b';
    ctx.beginPath();
    ctx.ellipse(cx, eyeY, 14, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 4, eyeY - 6, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 小さく穏やかな口
  ctx.strokeStyle = '#a55c3a';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(faceX, 300, 9, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 個体差に使う色の候補(既存パレットから選ぶ)
const DRESS_COLORS = [
  PALETTE.petal,
  PALETTE.flowerCenter,
  PALETTE.butterflyWing,
  PALETTE.cloud,
  PALETTE.accentPurple,
];
const HAT_COLORS = [
  PALETTE.leaf,
  PALETTE.leafDark,
  PALETTE.roof,
  PALETTE.accentRed,
  PALETTE.trunk,
  PALETTE.accentPurple,
];
const HAIR_COLORS = [PALETTE.hair, PALETTE.trunk, PALETTE.boots, PALETTE.eye];

/**
 * 積み木人形の村人。おえんちゃんと同じ約2.5頭身。
 * 服の色・帽子の種類(とんがりフード / 丸い帽子 / 髪)・前掛けの有無・
 * 背丈を個体ごとにランダムにして、村人らしいばらつきを出す。
 * 原点が足元、-Z が正面。腕と脚は付け根のピボットで振れる。
 */
function buildVillager(rand: Rand): { root: THREE.Group; limbs: VillagerLimbs } {
  const root = new THREE.Group();

  const dress = toonMaterial(DRESS_COLORS[Math.floor(rand() * DRESS_COLORS.length)]!);
  const hatColor = HAT_COLORS[Math.floor(rand() * HAT_COLORS.length)]!;
  const hat = toonMaterial(hatColor);
  const sleeve = toonMaterial(PALETTE.leafDark);
  const skin = toonMaterial(PALETTE.skin);
  const boots = toonMaterial(PALETTE.boots);

  const createLeg = (x: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.28, 0); // 腰の高さ
    const leg = new THREE.Mesh(legGeometry, sleeve);
    leg.position.y = -0.11;
    pivot.add(leg);
    const boot = new THREE.Mesh(bootGeometry, boots);
    boot.position.set(0, -0.245, -0.02);
    pivot.add(boot);
    root.add(pivot);
    return pivot;
  };
  const createArm = (x: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.62, 0); // 肩の高さ
    pivot.rotation.z = x < 0 ? -0.1 : 0.1; // 袖を少し外へ
    const arm = new THREE.Mesh(armGeometry, sleeve);
    arm.position.y = -0.08;
    pivot.add(arm);
    const hand = new THREE.Mesh(handGeometry, skin);
    hand.position.y = -0.2;
    pivot.add(hand);
    root.add(pivot);
    return pivot;
  };

  const limbs: VillagerLimbs = {
    leftLeg: createLeg(-0.085),
    rightLeg: createLeg(0.085),
    leftArm: createArm(-0.21),
    rightArm: createArm(0.21),
  };

  // 胴体(ワンピース風に裾が広い円錐台)
  const torso = new THREE.Mesh(torsoGeometry, dress);
  torso.position.y = 0.46;
  root.add(torso);

  // 前掛け(半分の村人だけ。色は帽子と揃える)
  if (rand() < 0.5) {
    const apron = new THREE.Mesh(apronGeometry, hat);
    apron.position.set(0, 0.42, -0.2);
    root.add(apron);
  }

  // 頭(大きな球にCanvasの顔を貼る。おえんちゃんと同じ作り)
  const head = new THREE.Mesh(headGeometry, getFaceMaterial());
  head.scale.set(1, 0.9, 0.96);
  head.position.y = 0.88;
  root.add(head);

  // 帽子または髪(3種類からランダム)
  const hatKind = Math.floor(rand() * 3);
  if (hatKind === 0) {
    // とんがりフード(目は隠さない高さ)
    const hood = new THREE.Mesh(hoodGeometry, hat);
    hood.position.y = 1.12;
    root.add(hood);
  } else if (hatKind === 1) {
    // 丸いつばなし帽(つぶした球を頭に被せる)
    const cap = new THREE.Mesh(capGeometry, hat);
    cap.position.y = 1.0;
    cap.scale.set(1, 0.62, 1);
    root.add(cap);
  } else {
    // 帽子なし:ボブ風の髪(後ろ上へずらした球)
    const hair = new THREE.Mesh(
      hairGeometry,
      toonMaterial(HAIR_COLORS[Math.floor(rand() * HAIR_COLORS.length)]!)
    );
    hair.position.set(0, 0.93, 0.04);
    hair.scale.set(1.02, 0.95, 1);
    root.add(hair);
  }

  // 体型:ふつう / 背が低い / ノッポさん / ぽっちゃりさん
  const bodyType = Math.floor(rand() * 4);
  let width = 1;
  let height = 1;
  if (bodyType === 1) {
    width = 1.08;
    height = 0.8; // 背が低い
  } else if (bodyType === 2) {
    width = 0.84;
    height = 1.3; // ノッポさん
  } else if (bodyType === 3) {
    width = 1.32;
    height = 0.95; // ぽっちゃりさん
  }
  const size = 0.92 + rand() * 0.16; // さらに個体ごとの背丈のばらつき
  root.scale.set(width * size, height * size, width * size);

  return { root, limbs };
}
