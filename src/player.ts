import * as THREE from 'three';
import { PLANET_RADIUS } from './world.ts';
import { PALETTE, toonMaterial, flatGeometry, getGradientMap } from './palette.ts';
import { resolveCollisions } from './collision.ts';

const MOVE_SPEED = 6; // 移動の速さ(単位/秒)
const TURN_RESPONSIVENESS = 10; // 移動方向へ振り向く速さ(指数減衰の係数)
const COLLIDER_RADIUS = 0.35; // プレイヤーの当たり判定の半径

// 毎フレームの new を避けるための使い回し用一時オブジェクト
const _up = new THREE.Vector3();
const _newUp = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _currentForward = new THREE.Vector3();
const _turnCross = new THREE.Vector3();
const _currentUp = new THREE.Vector3();
const _yawQuat = new THREE.Quaternion();
const _alignQuat = new THREE.Quaternion();

/**
 * カメラ相対の移動入力。
 * 「画面のどっちへ動きたいか」だけを表し、キャラの向きとは無関係
 */
export interface PlayerInput {
  /** 画面の右 +1 / 左 -1 / なし 0 */
  x: number;
  /** 画面の奥 +1 / 手前 -1 / なし 0 */
  z: number;
}

/**
 * 球形惑星の表面を歩くプレイヤー。
 *
 * 姿勢は mesh.quaternion に持たせる。ローカル +Y が「上」、
 * ローカル -Z が「前」という three.js の慣習に従う。
 * オイラー角は使わず、Quaternion の相対回転だけで姿勢を更新するため、
 * 極(北極・南極に相当する場所)でも向きが突然反転しない。
 */
export class Player {
  readonly mesh: THREE.Group;
  /** 見た目の揺れ専用の内側グループ。位置や姿勢の計算には一切使わない */
  private readonly body: THREE.Group;
  /** 腕と脚のピボット(歩行時に前後へ振る) */
  private readonly limbs: CharacterLimbs;
  private walkPhase = 0; // 歩行の足踏みの位相
  private bobStrength = 0; // 歩行揺れの強さ(0〜1を滑らかに変化)
  private turnLean = 0; // 旋回時の傾き(-1〜1を滑らかに変化)
  private elapsed = 0; // 経過時間(待機中の呼吸に使う)

  constructor() {
    const character = buildCharacter();
    this.body = character.root;
    this.limbs = character.limbs;
    this.mesh = new THREE.Group();
    this.mesh.add(this.body);
    // 開始位置:惑星の「北極」。ここでは球面法線 = +Y なので、
    // 初期姿勢(単位クォータニオン)がそのまま法線と一致する
    this.mesh.position.set(0, PLANET_RADIUS, 0);
  }

  /** その地点の球面法線(惑星中心 → プレイヤー)。重力はこの逆向き */
  getUp(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.mesh.position).normalize();
  }

  /** 接平面上の前方向(姿勢の -Z を法線と直交する接線方向へ投影) */
  getForward(out: THREE.Vector3): THREE.Vector3 {
    _up.copy(this.mesh.position).normalize();
    out.set(0, 0, -1).applyQuaternion(this.mesh.quaternion);
    // 接平面への投影:f - n * (f・n) で法線成分を取り除く
    out.addScaledVector(_up, -out.dot(_up));
    return out.normalize();
  }

  /**
   * カメラ相対の移動。
   * viewForward(カメラの視線の接平面成分)を「画面の奥」として
   * 入力を移動方向に変換し、キャラクターはその方向へ自動で振り向く。
   * S(手前)を押すと振り返ってカメラ側へ走ってくる。
   */
  update(deltaTime: number, input: PlayerInput, viewForward: THREE.Vector3): void {
    const position = this.mesh.position;
    const quaternion = this.mesh.quaternion;

    // 現在地の球面法線(惑星中心からプレイヤーへ向かう単位ベクトル)
    _up.copy(position).normalize();

    const moving = input.x !== 0 || input.z !== 0;
    let turnLean = 0;

    if (moving) {
      // カメラ基準の「画面の奥」と「画面の右」を接平面上に作る
      _forward.copy(viewForward).addScaledVector(_up, -viewForward.dot(_up)).normalize();
      _right.crossVectors(_forward, _up).normalize();

      // 入力をカメラ基準の移動方向へ変換する
      _moveDir
        .copy(_forward)
        .multiplyScalar(input.z)
        .addScaledVector(_right, input.x)
        .normalize();

      // --- 移動方向へ滑らかに振り向く ---
      // 現在の前方向と移動方向のなす角(法線まわりの符号つき)を求め、
      // 指数減衰で寄せる。ワールド軸ではなく法線を軸にするので、
      // 惑星のどこにいても同じ操作感になる
      _currentForward.set(0, 0, -1).applyQuaternion(quaternion);
      _currentForward.addScaledVector(_up, -_currentForward.dot(_up)).normalize();
      _turnCross.crossVectors(_currentForward, _moveDir);
      const angle = Math.atan2(_turnCross.dot(_up), _currentForward.dot(_moveDir));
      const turnT = 1 - Math.exp(-TURN_RESPONSIVENESS * deltaTime);
      _yawQuat.setFromAxisAngle(_up, angle * turnT);
      quaternion.premultiply(_yawQuat);
      turnLean = THREE.MathUtils.clamp(angle, -1, 1); // 旋回中の体の傾きに使う

      // --- 移動 ---
      // 振り向きを待たず、入力された方向へそのまま進む(操作の即応性を優先)
      position.addScaledVector(_moveDir, MOVE_SPEED * deltaTime);

      // 接線方向へ動くと球からわずかに離れるので、
      // 惑星中心から半径ちょうどの位置へ正規化して戻す(浮き・めり込み防止)
      position.normalize().multiplyScalar(PLANET_RADIUS);

      // 障害物に食い込んでいたら、球面に沿って押し出す
      // (回転による押し出しなので、中心からの距離は半径のまま変わらない)
      resolveCollisions(position, COLLIDER_RADIUS);
    }

    // --- 姿勢の補正 ---
    // 移動後の新しい法線に「プレイヤーの上」を一致させる。
    // 現在の上 → 新しい上 への最小回転を求めて掛けるだけなので、
    // 前方向の連続性が保たれ、極付近でも反転しない
    _newUp.copy(position).normalize();
    _currentUp.set(0, 1, 0).applyQuaternion(quaternion);
    _alignQuat.setFromUnitVectors(_currentUp, _newUp);
    quaternion.premultiply(_alignQuat);

    // 数値誤差の蓄積を防ぐため、毎フレーム正規化する
    quaternion.normalize();

    this.updateBodyMotion(deltaTime, moving, turnLean);
  }

  /**
   * 室内(平面)用の移動。家の中では球面ではなく床(y=0)の上を歩く。
   * 入力の解釈と歩行モーションは球面時と同じで、位置の計算だけ平面になる。
   * bounds で部屋の内側に収める(家具はぶつかるほど狭くないので判定しない)。
   */
  updateInRoom(
    deltaTime: number,
    input: PlayerInput,
    viewForward: THREE.Vector3,
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  ): void {
    const position = this.mesh.position;
    const quaternion = this.mesh.quaternion;
    _up.set(0, 1, 0);

    const moving = input.x !== 0 || input.z !== 0;
    let turnLean = 0;

    if (moving) {
      // カメラ基準の「画面の奥」「画面の右」を床の上に作る
      _forward.copy(viewForward);
      _forward.y = 0;
      if (_forward.lengthSq() < 1e-6) _forward.set(0, 0, -1);
      _forward.normalize();
      _right.crossVectors(_forward, _up).normalize();
      _moveDir
        .copy(_forward)
        .multiplyScalar(input.z)
        .addScaledVector(_right, input.x)
        .normalize();

      // 移動方向へ滑らかに振り向く(球面版と同じ、軸がY固定なだけ)
      _currentForward.set(0, 0, -1).applyQuaternion(quaternion);
      _currentForward.y = 0;
      _currentForward.normalize();
      _turnCross.crossVectors(_currentForward, _moveDir);
      const angle = Math.atan2(_turnCross.dot(_up), _currentForward.dot(_moveDir));
      const turnT = 1 - Math.exp(-TURN_RESPONSIVENESS * deltaTime);
      _yawQuat.setFromAxisAngle(_up, angle * turnT);
      quaternion.premultiply(_yawQuat);
      turnLean = THREE.MathUtils.clamp(angle, -1, 1);

      // 室内は歩幅を少し落ち着かせる
      position.addScaledVector(_moveDir, MOVE_SPEED * 0.55 * deltaTime);
      position.x = THREE.MathUtils.clamp(position.x, bounds.minX, bounds.maxX);
      position.z = THREE.MathUtils.clamp(position.z, bounds.minZ, bounds.maxZ);
    }

    // 姿勢の「上」をY+に寄せる(球面から入ってきた直後の傾きを吸収する)
    _currentUp.set(0, 1, 0).applyQuaternion(quaternion);
    _alignQuat.setFromUnitVectors(_currentUp, _up);
    quaternion.premultiply(_alignQuat);
    quaternion.normalize();
    position.y = 0;

    this.updateBodyMotion(deltaTime, moving, turnLean);
  }

  /**
   * 歩行モーションもどき。見た目専用の内側グループ(this.body)だけを
   * 揺らすので、球面移動やカメラの計算には影響しない。
   * turnLean は移動方向への振り向き量(-1〜1)で、旋回中の体の傾きに使う。
   */
  private updateBodyMotion(deltaTime: number, moving: boolean, turnLean: number): void {
    this.elapsed += deltaTime;

    // 歩き始め・止まり際に揺れが急に切り替わらないよう指数減衰で補間する
    const smoothing = 1 - Math.exp(-8 * deltaTime);
    this.bobStrength += ((moving ? 1 : 0) - this.bobStrength) * smoothing;
    this.turnLean += (turnLean - this.turnLean) * smoothing;
    if (moving) this.walkPhase += deltaTime * 9;

    const body = this.body;
    // 歩行中は足踏みに合わせて弾み、停止中はゆっくり呼吸する
    body.position.y =
      Math.abs(Math.sin(this.walkPhase)) * 0.07 * this.bobStrength +
      Math.sin(this.elapsed * 1.6) * 0.02 * (1 - this.bobStrength);
    // 足踏みに合わせた左右の揺れ + 旋回中は内側へ傾く
    body.rotation.z =
      Math.sin(this.walkPhase) * 0.05 * this.bobStrength + this.turnLean * 0.12;
    // 歩行中はわずかに前傾する
    body.rotation.x = -0.08 * this.bobStrength;

    // 腕と脚を交互に振る(止まると自然に元へ戻る)
    const swing = Math.sin(this.walkPhase) * this.bobStrength;
    this.limbs.leftLeg.rotation.x = swing * 0.65;
    this.limbs.rightLeg.rotation.x = -swing * 0.65;
    this.limbs.leftArm.rotation.x = -swing * 0.45;
    this.limbs.rightArm.rotation.x = swing * 0.45;
  }
}

/**
 * 顔のテクスチャをHTML Canvasでコード生成する(画像ファイルは使わない)。
 * SphereGeometryのUVは「正面(-Z)= 横0.75 / 頭頂 = キャンバス上端」なので、
 * キャンバスの (0.75 × 幅, 約0.45 × 高さ) を中心に顔を描くと球の正面に来る。
 * 眼鏡もここに描くことで、立体パーツよりずっと細いフレームにできる。
 */
function createFaceTexture(): THREE.CanvasTexture {
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

  // 下地は手足と同じ肌色(PALETTE.skin と揃える)
  ctx.fillStyle = '#f0cfa4';
  ctx.fillRect(0, 0, W, H);

  const faceX = W * 0.75; // 球の正面(-Z)に当たる位置
  const eyeY = 230; // 顔の中心よりやや上
  const eyeDX = 56; // 目の左右の間隔

  // ごく薄い頬の赤み
  ctx.fillStyle = 'rgba(236, 146, 110, 0.34)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(faceX + side * 100, 280, 21, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 眉(眼鏡の上にのぞく、細い茶色の弧。キャラクターシート準拠)
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(faceX + side * eyeDX, eyeY - 26, 26, 14, 0, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  }

  // 目(キャラクターシートの大きな琥珀の瞳。縁取り+上まぶたの影+グラデーション)
  for (const side of [-1, 1]) {
    const cx = faceX + side * eyeDX;
    // 白目(瞳のまわりにわずかに見せる)
    ctx.fillStyle = '#fdf7ec';
    ctx.beginPath();
    ctx.ellipse(cx, eyeY, 29, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    // 虹彩の縁取り(こげ茶)→ 基調の琥珀 → 下側の明るい透け
    ctx.fillStyle = '#7a4712';
    ctx.beginPath();
    ctx.ellipse(cx, eyeY, 25, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#dd8524';
    ctx.beginPath();
    ctx.ellipse(cx, eyeY + 2, 21, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6c060';
    ctx.beginPath();
    ctx.ellipse(cx, eyeY + 13, 14, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    // 上まぶたの影(虹彩の上部を暗く。伏し目の柔らかさ)
    ctx.fillStyle = 'rgba(90, 50, 15, 0.45)';
    ctx.beginPath();
    ctx.ellipse(cx, eyeY - 20, 24, 12, 0, 0, Math.PI, true);
    ctx.fill();
    // 瞳孔
    ctx.fillStyle = '#4a2e0c';
    ctx.beginPath();
    ctx.ellipse(cx, eyeY + 1, 8, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // 上まつ毛(太いラインで目力を出す。目尻をわずかに跳ね上げ)
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.ellipse(cx, eyeY, 27, 33, 0, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    // 下まぶた(細く控えめ)
    ctx.strokeStyle = 'rgba(58, 42, 26, 0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, eyeY, 25, 32, 0, Math.PI * 0.25, Math.PI * 0.75);
    ctx.stroke();
    // 白いハイライト(左上に大・右下に小。参考絵と同じ配置)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx - 9, eyeY - 10, 8, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 9, eyeY + 10, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 眼鏡(キャラクターシートの太い黒縁・角丸フレーム。瞳の上に重ねる)
  ctx.strokeStyle = '#2e2823';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(faceX + side * eyeDX - 41, eyeY - 34, 82, 66, 24);
    ctx.stroke();
  }
  // ブリッジ(少し上をわたす)
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(faceX - 16, eyeY - 14);
  ctx.quadraticCurveTo(faceX, eyeY - 20, faceX + 16, eyeY - 14);
  ctx.stroke();
  // つる(こめかみへ。横髪に隠れる程度)
  ctx.lineWidth = 5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(faceX + side * (eyeDX + 41), eyeY - 8);
    ctx.lineTo(faceX + side * (eyeDX + 78), eyeY - 18);
    ctx.stroke();
  }

  // 小さく穏やかな口
  ctx.strokeStyle = '#a55c3a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(faceX, 305, 11, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface CharacterLimbs {
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  /** 尻尾の付け根(今はまだ揺らさないが、後から回転で動かせる) */
  tail: THREE.Group;
}

/**
 * 積み木・木製玩具調の「薬屋の女の子」。プリミティブのみで組み立てる。
 * 原点が足元、-Z が正面。約3頭身で頭を大きめにする。
 *
 * 階層:characterRoot > body(胴の飾り一式)/ head(顔・髪・耳・眼鏡)/
 * 各ピボット(腕=肩・脚=腰・尻尾=付け根)/ backpack。
 * ピボットを回転させるだけで腕・脚・尻尾を振れる構造にしてある。
 */
function buildCharacter(): { root: THREE.Group; limbs: CharacterLimbs } {
  const root = new THREE.Group();
  root.name = 'characterRoot';

  const hair = toonMaterial(PALETTE.hair); // 髪・猫耳・尻尾の黄緑
  const hairLight = toonMaterial(PALETTE.hairLight); // 髪の明るい房
  const earInner = toonMaterial(PALETTE.earInner); // 猫耳の内側のピンク
  const kimono = toonMaterial(PALETTE.kimono); // 緑の着物
  const haori = toonMaterial(PALETTE.haori); // オレンジの羽織
  const skin = toonMaterial(PALETTE.skin);
  const socks = toonMaterial(PALETTE.socks); // 黒い長い靴下
  const shoes = toonMaterial(PALETTE.boots); // 濃い茶の履物
  const pack = toonMaterial(PALETTE.trunk); // 茶色のリュック
  const white = toonMaterial(PALETTE.petal); // 帯・尻尾の先・羽織の花

  // --- 脚(ピボット=腰)。短めにしてちびキャラの比率にする ---
  const legGeometry = flatGeometry(new THREE.CylinderGeometry(0.06, 0.055, 0.24, 6));
  const shoeGeometry = flatGeometry(new THREE.BoxGeometry(0.12, 0.07, 0.17));
  const createLeg = (x: number, name: string): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(x, 0.28, 0); // 腰の高さ
    const leg = new THREE.Mesh(legGeometry, socks);
    leg.position.y = -0.11;
    pivot.add(leg);
    const shoe = new THREE.Mesh(shoeGeometry, shoes);
    shoe.position.set(0, -0.245, -0.02);
    pivot.add(shoe);
    root.add(pivot);
    return pivot;
  };

  // --- 腕(ピボット=肩)。丸くゆるい和袖にする ---
  const armGeometry = flatGeometry(new THREE.CylinderGeometry(0.06, 0.105, 0.19, 7));
  const cuffGeometry = flatGeometry(new THREE.SphereGeometry(0.1, 7, 5));
  const handGeometry = flatGeometry(new THREE.SphereGeometry(0.05, 6, 5));
  const sleeveFlowerGeometry = flatGeometry(new THREE.SphereGeometry(0.018, 5, 4));
  const createArm = (x: number, name: string): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(x, 0.675, 0); // 肩の高さ(少し下げてなで肩にする)
    // 袖はほぼ真下に落とし、わずかに外へ逃がす程度にする
    // (歩行アニメーションは rotation.x しか触らないので競合しない)
    pivot.rotation.z = x < 0 ? -0.06 : 0.06;
    const sleeve = new THREE.Mesh(armGeometry, haori);
    sleeve.position.y = -0.09;
    pivot.add(sleeve);
    // 袖口(つぶした球で裾を丸く少し広げ、ゆるい羽織らしくする)
    const cuff = new THREE.Mesh(cuffGeometry, haori);
    cuff.position.y = -0.19;
    cuff.scale.set(1.12, 0.52, 1.12);
    pivot.add(cuff);
    // 袖にも白い小花をひとつ
    const flower = new THREE.Mesh(sleeveFlowerGeometry, white);
    flower.position.set(x < 0 ? -0.075 : 0.075, -0.12, -0.04);
    pivot.add(flower);
    const hand = new THREE.Mesh(handGeometry, skin);
    hand.position.y = -0.25;
    pivot.add(hand);
    root.add(pivot);
    return pivot;
  };

  // --- 胴体(bodyグループ):緑の着物(本体)+ 前開きのオレンジ羽織 ---
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  // 着物本体(肩から裾まで1本の裾広がり円錐台。これが「下に着ている服」)
  const kimonoBody = new THREE.Mesh(
    flatGeometry(new THREE.CylinderGeometry(0.155, 0.25, 0.48, 7)),
    kimono
  );
  kimonoBody.position.y = 0.52;
  body.add(kimonoBody);

  // 羽織(前が開いたオレンジの筒)。theta で正面を切り欠き、
  // 開きから下の緑の着物が実際に見える構造にする。
  // 着物より一回り大きい半径にして「上に羽織っている布」の浮きを出す
  const HAORI_GAP = 0.9; // 前開きの角度(ラジアン)
  const haoriShell = new THREE.Mesh(
    flatGeometry(
      new THREE.CylinderGeometry(
        0.185,
        0.235,
        0.32,
        8,
        1,
        true, // フタなし(布の筒)
        Math.PI + HAORI_GAP / 2, // 正面(-Z)を中心に切り欠く
        Math.PI * 2 - HAORI_GAP
      )
    ),
    new THREE.MeshToonMaterial({
      color: PALETTE.haori,
      gradientMap: getGradientMap(),
      side: THREE.DoubleSide, // 前開きの切り口から見える内側も描く
    })
  );
  haoriShell.position.y = 0.62;
  body.add(haoriShell);

  // 羽織の黒い縁取り(前開きの両端=前合わせのラインに沿わせる)
  const collarGeometry = flatGeometry(new THREE.BoxGeometry(0.03, 0.32, 0.018));
  for (const side of [-1, 1]) {
    const collar = new THREE.Mesh(collarGeometry, socks);
    collar.position.set(side * 0.091, 0.62, -0.187);
    collar.rotation.y = -side * 0.45;
    body.add(collar);
  }

  // 着物の襟(前開きの上部から覗く、濃い緑のV字の合わせ)
  const kimonoCollarGeometry = flatGeometry(new THREE.BoxGeometry(0.026, 0.13, 0.014));
  const kimonoCollar = toonMaterial(PALETTE.leafDark);
  for (const side of [-1, 1]) {
    const kc = new THREE.Mesh(kimonoCollarGeometry, kimonoCollar);
    kc.position.set(side * 0.045, 0.71, -0.17);
    kc.rotation.z = -side * 0.5;
    body.add(kc);
  }

  // 羽織の紐(胸元の茶色い結び)。結び目の球 + 左右の黒縁へ渡る紐 +
  // 結び目から斜め下へ垂れる短い紐。帯(腰)より上の胸元に置く
  const cord = toonMaterial(PALETTE.wood);
  const cordKnot = new THREE.Mesh(flatGeometry(new THREE.SphereGeometry(0.022, 6, 5)), cord);
  cordKnot.position.set(0, 0.67, -0.19);
  body.add(cordKnot);
  const cordSideGeometry = flatGeometry(new THREE.CylinderGeometry(0.008, 0.008, 0.085, 5));
  const cordDropGeometry = flatGeometry(new THREE.CylinderGeometry(0.007, 0.007, 0.06, 5));
  for (const side of [-1, 1]) {
    // 黒縁の端へ、少したわんで上がっていく紐
    const sideCord = new THREE.Mesh(cordSideGeometry, cord);
    sideCord.position.set(side * 0.048, 0.676, -0.185);
    sideCord.rotation.z = Math.PI / 2 + side * 0.18;
    body.add(sideCord);
    // 結び目から斜め下へ垂れる短い紐
    const dropCord = new THREE.Mesh(cordDropGeometry, cord);
    dropCord.position.set(side * 0.018, 0.635, -0.188);
    dropCord.rotation.z = side * 0.22;
    body.add(dropCord);
  }

  // 腰の白い帯(前開きの中、緑の着物の上に締める)と小さな結び
  const ribbon = new THREE.Mesh(flatGeometry(new THREE.BoxGeometry(0.13, 0.06, 0.04)), white);
  ribbon.position.set(0, 0.5, -0.2);
  body.add(ribbon);
  const knot = new THREE.Mesh(flatGeometry(new THREE.BoxGeometry(0.08, 0.045, 0.035)), white);
  knot.position.set(0, 0.455, -0.215);
  body.add(knot);

  // 羽織の小花(前開きを避けて羽織の面に散らす)
  const flowerGeometry = flatGeometry(new THREE.SphereGeometry(0.02, 5, 4));
  const flowerSpots: Array<[number, number, number]> = [
    [-0.16, 0.58, -0.145],
    [0.19, 0.66, -0.06],
    [0.16, 0.52, -0.16],
    [-0.18, 0.7, 0.08],
    [0.19, 0.56, 0.11],
  ];
  for (const [x, y, z] of flowerSpots) {
    const flower = new THREE.Mesh(flowerGeometry, white);
    flower.position.set(x, y, z);
    body.add(flower);
  }

  // --- 頭(headグループ):大きな頭で約2.5頭身にする ---
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 0.92;
  root.add(head);

  // 顔:肌色の球に、Canvasで描いた目・眼鏡・口を直接貼る。
  // テクスチャが球面に沿って曲がるので、平面プレートのような不自然さが出ない。
  // 横に広く・縦に短くつぶして、丸い頬の幼い輪郭にする
  const skull = new THREE.Mesh(
    flatGeometry(new THREE.SphereGeometry(0.24, 12, 9)),
    new THREE.MeshToonMaterial({ map: createFaceTexture(), gradientMap: getGradientMap() })
  );
  skull.scale.set(0.955, 0.88, 0.96); // 顔をわずかに小さく、丸く
  head.add(skull);

  // ボブの土台(頭より大きい球を後ろ上へずらし、顔まわりだけ出す)
  const hairBall = new THREE.Mesh(flatGeometry(new THREE.SphereGeometry(0.275, 9, 7)), hair);
  hairBall.position.set(0, 0.05, 0.05);
  hairBall.scale.set(1.09, 0.96, 1.0); // 髪の横幅を広げ、相対的に顔を小さく見せる
  head.add(hairBall);

  // 前髪:下へ落ちる房(先細りの円錐)を5本並べる。
  // 長さ・太さ・厚み・傾きを房ごとに少しずつ変えて、
  // 均一な板や束に見えないようにする
  const strandSpecs: Array<[number, number, number, number, number, number, boolean]> = [
    // [x, 房の長さ, z, 房の太さ, 傾き(rad), 厚み, 明るい色の房か]
    [0, 0.21, -0.205, 0.06, 0, 0.62, false], // 中央:いちばん長く、少し前へ
    [-0.08, 0.135, -0.202, 0.052, 0.12, 0.55, true], // 少し前に出す房
    [0.08, 0.155, -0.19, 0.058, -0.1, 0.7, false],
    [-0.155, 0.19, -0.148, 0.066, 0.17, 0.62, false],
    [0.155, 0.16, -0.155, 0.058, -0.14, 0.5, true],
  ];
  for (const [x, len, z, r, tilt, depth, light] of strandSpecs) {
    const strand = new THREE.Mesh(
      flatGeometry(new THREE.ConeGeometry(r, len, 5)),
      light ? hairLight : hair
    );
    strand.rotation.x = Math.PI; // 先端を下へ向ける
    strand.rotation.z = tilt; // 房ごとに毛先の流れる向きを変える
    strand.position.set(x, 0.2 - len / 2, z); // 上端は髪の土台に隠す
    strand.scale.z = depth; // おでこに沿わせて薄くする(房ごとに厚みを変える)
    head.add(strand);
  }

  // 横髪:頬を包みながら裾が外へ広がる房
  const sidePuffGeometry = flatGeometry(new THREE.SphereGeometry(0.115, 7, 5));
  for (const side of [-1, 1]) {
    const puff = new THREE.Mesh(sidePuffGeometry, hair);
    puff.position.set(side * 0.235, -0.06, -0.01);
    puff.scale.set(0.8, 1.25, 1.0);
    puff.rotation.z = side * 0.12; // 裾を外へ広げる
    head.add(puff);
  }
  // 後頭部の丸み(えり足まで2段でボブの丸みを出す)
  const backPuff = new THREE.Mesh(sidePuffGeometry, hair);
  backPuff.position.set(0, -0.06, 0.19);
  backPuff.scale.set(1.45, 1.1, 1.0);
  head.add(backPuff);
  const napeTuft = new THREE.Mesh(sidePuffGeometry, hairLight);
  napeTuft.position.set(0, -0.15, 0.13);
  napeTuft.scale.set(1.35, 0.75, 0.9);
  head.add(napeTuft);

  // 猫耳(少し外側へ向け、内側の淡いピンクを見せる)
  const earGeometry = flatGeometry(new THREE.ConeGeometry(0.095, 0.2, 5));
  const innerEarGeometry = flatGeometry(new THREE.ConeGeometry(0.055, 0.12, 5));
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeometry, hair);
    ear.position.set(side * 0.15, 0.31, 0.02);
    ear.rotation.z = -side * 0.5;
    head.add(ear);
    const innerEar = new THREE.Mesh(innerEarGeometry, earInner);
    innerEar.position.set(side * 0.17, 0.3, -0.02);
    innerEar.rotation.z = -side * 0.5;
    innerEar.scale.z = 0.5;
    head.add(innerEar);
  }

  // --- 尻尾(ピボット=付け根)。太め・長めにして存在感を出す ---
  const tailPivot = new THREE.Group();
  tailPivot.name = 'tailPivot';
  tailPivot.position.set(0, 0.34, 0.24); // 背中側(+Z)、着物の裾の外から生やす
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -0.04, 0.18),
    new THREE.Vector3(0.13, 0.14, 0.32), // リュックを避けて横へ逃がしつつ上へ
    new THREE.Vector3(0.22, 0.48, 0.32), // 先端を肩の高さ近くまで上げ、正面からも白い先がのぞく
  ]);
  const tailMesh = new THREE.Mesh(
    flatGeometry(new THREE.TubeGeometry(tailCurve, 9, 0.05, 5, false)),
    hair
  );
  tailPivot.add(tailMesh);
  const tailTip = new THREE.Mesh(flatGeometry(new THREE.SphereGeometry(0.068, 6, 5)), white);
  tailTip.position.copy(tailCurve.points[3]!);
  tailPivot.add(tailTip);
  root.add(tailPivot);

  // --- リュック(背中 = +Z 側)。大きめの箱 + フラップ + ベルト2本 ---
  const backpack = new THREE.Group();
  backpack.name = 'backpack';
  backpack.position.set(0, 0.6, 0.3); // 羽織のふくらみの外側に背負う
  const packBody = new THREE.Mesh(flatGeometry(new THREE.BoxGeometry(0.3, 0.34, 0.16)), pack);
  backpack.add(packBody);
  const packFlap = new THREE.Mesh(flatGeometry(new THREE.BoxGeometry(0.31, 0.12, 0.03)), shoes);
  packFlap.position.set(0, 0.11, 0.075);
  backpack.add(packFlap);
  const beltGeometry = flatGeometry(new THREE.BoxGeometry(0.035, 0.3, 0.02));
  for (const x of [-0.07, 0.07]) {
    const belt = new THREE.Mesh(beltGeometry, shoes);
    belt.position.set(x, -0.02, 0.085);
    backpack.add(belt);
  }
  // 肩ベルト(正面や斜めからもリュックを背負っていると分かるように)
  const strapGeometry = flatGeometry(new THREE.BoxGeometry(0.04, 0.02, 0.26));
  for (const x of [-0.1, 0.1]) {
    const strap = new THREE.Mesh(strapGeometry, shoes);
    strap.position.set(x, 0.19, -0.16);
    strap.rotation.x = -0.25; // 肩の上から胸側へ少し下ろす
    backpack.add(strap);
  }
  root.add(backpack);

  const limbs: CharacterLimbs = {
    leftLeg: createLeg(-0.09, 'leftLegPivot'),
    rightLeg: createLeg(0.09, 'rightLegPivot'),
    leftArm: createArm(-0.235, 'leftArmPivot'),
    rightArm: createArm(0.235, 'rightArmPivot'),
    tail: tailPivot,
  };

  return { root, limbs };
}
