import * as THREE from 'three';
import { PLANET_RADIUS } from './world.ts';
import type { Player } from './player.ts';

const DEFAULT_DISTANCE = 8.3; // プレイヤーからカメラまでの距離
const MIN_DISTANCE = 3.5; // ズームインの限界
const MAX_DISTANCE = 18; // ズームアウトの限界
const DEFAULT_PITCH = 0.42; // 既定の見下ろし角(ラジアン)。以前の後方+上の構図と同じ
const MIN_PITCH = -0.25; // 見上げの限界(これより下は惑星に隠れる)
const MAX_PITCH = 1.35; // 見下ろしの限界(真上直前。真上は lookAt が壊れるので避ける)
const LOOK_HEIGHT = 1.2; // 注視点をプレイヤーの少し上にする
const POSITION_SMOOTHING = 5; // 位置の追従の速さ
const UP_SMOOTHING = 5; // 上方向の追従の速さ
const MIN_ALTITUDE = 1.5; // カメラが惑星表面より内側に入らないための余裕
const ORBIT_SENSITIVITY = 0.005; // ドラッグ1ピクセルあたりの回転量(ラジアン)
const ZOOM_SENSITIVITY = 0.0012; // ホイール1目盛りあたりのズーム量

// 使い回し用の一時オブジェクト
const _up = new THREE.Vector3();
const _desiredPosition = new THREE.Vector3();
const _desiredTarget = new THREE.Vector3();
const _transportQuat = new THREE.Quaternion();
const _dragYawQuat = new THREE.Quaternion();

/**
 * 球面上のプレイヤーを追いかける三人称カメラ。
 * ドラッグでプレイヤーの周りを自由に周回でき(ホイールでズーム)、
 * 正面・横・頭上など、どんな向きからでもプレイヤーを見られる。
 *
 * 視線方向(viewForward)はプレイヤーの向きから独立して保持する。
 * これが「カメラ相対移動」の基準になる:キャラが移動方向へ振り向いても
 * カメラは回らないので、Aを押し続けても画面が回転せず左へ進み続ける。
 * プレイヤーが球面上を移動したぶんは、法線の変化の最小回転で
 * 視線方向を運ぶ(平行移動)ので、惑星の裏側や極でも破綻しない。
 * カメラの「上」もその地点の球面法線に合わせて滑らかに補間する。
 */
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** カメラの視線方向(プレイヤー位置の接平面上の単位ベクトル) */
  private readonly viewForward = new THREE.Vector3(0, 0, -1);
  /** 前フレームの球面法線(視線方向の平行移動に使う) */
  private readonly previousUp = new THREE.Vector3(0, 1, 0);
  /** ドラッグで溜まった周回角(次の update で消費する) */
  private pendingYaw = 0;
  /** 見下ろし角。正で上から、負で下から見る */
  private pitch = DEFAULT_PITCH;
  private distance = DEFAULT_DISTANCE;
  private readonly smoothedTarget = new THREE.Vector3();
  private readonly smoothedUp = new THREE.Vector3(0, 1, 0);
  private initialized = false;
  /** ドラッグ中のポインターID(ドラッグしていないときは null) */
  private dragPointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;

  constructor(aspect: number, element: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    this.bindPointerControls(element);
  }

  /** ドラッグで周回・ホイールでズームの入力を組み付ける */
  private bindPointerControls(element: HTMLElement): void {
    element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return; // 左ボタン(タッチ含む)のみ
      this.dragPointerId = event.pointerId;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      try {
        // タッチでも指の追跡が途切れないようにキャプチャする
        element.setPointerCapture(event.pointerId);
      } catch {
        // 合成イベント(テスト)ではキャプチャできなくてよい
      }
    });
    // move / up は window で拾い、canvas の外へ出てもドラッグを続ける
    window.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.dragPointerId) return;
      const dx = event.clientX - this.lastPointerX;
      const dy = event.clientY - this.lastPointerY;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      // 右へドラッグ → カメラがプレイヤーの右側へ回り込む
      // (角度はいったん溜めて、次の update で法線を軸に回す)
      this.pendingYaw -= dx * ORBIT_SENSITIVITY;
      // 下へドラッグ → カメラが上がり、見下ろす角度になる
      this.pitch = THREE.MathUtils.clamp(
        this.pitch + dy * ORBIT_SENSITIVITY,
        MIN_PITCH,
        MAX_PITCH
      );
    });
    const endDrag = (event: PointerEvent) => {
      if (event.pointerId === this.dragPointerId) this.dragPointerId = null;
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', () => {
      this.dragPointerId = null; // キー入力(main.ts)と同じく、フォーカスが外れたら解除
    });

    element.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault(); // ページのスクロールやブラウザのズームを抑える
        // 指数スケールでズームすると、近くでも遠くでも同じ操作感になる
        this.distance = THREE.MathUtils.clamp(
          this.distance * Math.exp(event.deltaY * ZOOM_SENSITIVITY),
          MIN_DISTANCE,
          MAX_DISTANCE
        );
      },
      { passive: false }
    );
  }

  /**
   * カメラ相対移動の基準になる「画面の奥」方向を返す。
   * プレイヤー位置の接平面上の単位ベクトル(前フレームの値)
   */
  getViewDirection(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.viewForward);
  }

  update(deltaTime: number, player: Player): void {
    player.getUp(_up);

    if (!this.initialized) {
      // 初回はプレイヤーの背後からスタートする
      player.getForward(this.viewForward);
      this.previousUp.copy(_up);
    }

    // --- 視線方向の更新 ---
    // 1) プレイヤーが球面上を動いたぶん、前の法線 → 今の法線への
    //    最小回転で視線方向を運ぶ(平行移動)。キャラの向きは参照しない
    _transportQuat.setFromUnitVectors(this.previousUp, _up);
    this.viewForward.applyQuaternion(_transportQuat);
    // 2) ドラッグで溜まった周回角を、法線を軸に回す
    if (this.pendingYaw !== 0) {
      _dragYawQuat.setFromAxisAngle(_up, this.pendingYaw);
      this.viewForward.applyQuaternion(_dragYawQuat);
      this.pendingYaw = 0;
    }
    // 3) 接平面へ再投影して数値誤差を取り除く
    this.viewForward.addScaledVector(_up, -this.viewForward.dot(_up)).normalize();
    this.previousUp.copy(_up);

    // 望ましいカメラ位置:視線方向の後ろ側 + 法線方向(上下)に pitch で振り分ける
    _desiredPosition
      .copy(player.mesh.position)
      .addScaledVector(this.viewForward, -Math.cos(this.pitch) * this.distance)
      .addScaledVector(_up, Math.sin(this.pitch) * this.distance);

    // 注視点:プレイヤーの少し上
    _desiredTarget
      .copy(player.mesh.position)
      .addScaledVector(_up, LOOK_HEIGHT);

    if (!this.initialized) {
      // 初回はスナップして、開始直後の大きなカメラ移動を防ぐ
      this.camera.position.copy(_desiredPosition);
      this.smoothedTarget.copy(_desiredTarget);
      this.smoothedUp.copy(_up);
      this.initialized = true;
    } else {
      // 指数減衰による補間。deltaTime を使うのでフレームレートに依存しない
      const t = 1 - Math.exp(-POSITION_SMOOTHING * deltaTime);
      const tUp = 1 - Math.exp(-UP_SMOOTHING * deltaTime);
      this.camera.position.lerp(_desiredPosition, t);
      this.smoothedTarget.lerp(_desiredTarget, t);
      this.smoothedUp.lerp(_up, tUp).normalize();
    }

    // 補間の途中や見上げ視点でも惑星の内部に入らないよう、
    // 中心からの距離を下限でクランプ
    const minRadius = PLANET_RADIUS + MIN_ALTITUDE;
    if (this.camera.position.lengthSq() < minRadius * minRadius) {
      this.camera.position.setLength(minRadius);
    }

    // カメラの上方向を球面法線(を滑らかにしたもの)に合わせてから注視する
    this.camera.up.copy(this.smoothedUp);
    this.camera.lookAt(this.smoothedTarget);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
