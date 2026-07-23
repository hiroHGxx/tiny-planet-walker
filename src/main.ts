import * as THREE from 'three';
import './style.css';
import { createWorld, enableShadows, getSunElevation } from './world.ts';
import { THEME, setPlanetTheme } from './palette.ts';
import { Player, type PlayerInput } from './player.ts';
import { FollowCamera } from './camera.ts';
import { createEffects } from './effects.ts';
import { SpeechBubbles } from './dialogue.ts';
import { createJournal } from './journal.ts';
import { createAmbientAudio } from './audio.ts';
import { EventBus } from './features/events.ts';
import { currentPlanet } from './features/planet-state.ts';
import { FEATURES } from './features/registry.ts';
import type { FeatureContext } from './features/feature.ts';

// --- レンダラーとシーン ---
const canvas = document.querySelector<HTMLCanvasElement>('#app')!;

/** WebGLが使えない環境向けの案内を表示する */
function showWebGLError(): void {
  if (document.querySelector('#webgl-error')) return;
  const message = document.createElement('div');
  message.id = 'webgl-error';
  message.innerHTML =
    'この作品の表示には WebGL が必要です。<br />' +
    'ブラウザのハードウェアアクセラレーションを有効にするか、<br />' +
    'WebGL対応のブラウザ(Chrome / Firefox / Safari の最新版)でお試しください。';
  document.body.appendChild(message);
}

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (error) {
  // WebGLコンテキストを作れない環境では、案内を出して初期化を中断する
  showWebGLError();
  throw error;
}
// 実行中にGPUコンテキストが失われた場合も案内を出す
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  showWebGLError();
});
// コンテキストが復帰したら(ドライバの一時リセット等)、案内を出しっぱなしにしない
canvas.addEventListener('webglcontextrestored', () => {
  document.querySelector('#webgl-error')?.remove();
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // 縁の柔らかい影

const scene = new THREE.Scene();

// 動く世界の更新関数と、つぶやき・図鑑が使う参照(村人・薬草)を受け取る
setPlanetTheme(currentPlanet()); // 星ごとのテーマ(草地・木の葉・空・湖の色。世界を作る前に)
scene.background = new THREE.Color(THEME.sky);
const world = createWorld(scene, currentPlanet() - 1);

const player = new Player();
enableShadows(player.mesh); // プレイヤーも影を落とす
scene.add(player.mesh);

// ドラッグ周回・ホイールズームの入力は canvas に組み付ける
const followCamera = new FollowCamera(window.innerWidth / window.innerHeight, canvas);

// ポストプロセス(輪郭線・ブルーム・ビネット)
const effects = createEffects(renderer, scene, followCamera.camera);

// 村人のつぶやき・薬草図鑑・環境音・機能間のイベントバス
const events = new EventBus();
const speechBubbles = new SpeechBubbles(world.npcs, followCamera.camera);
const journal = createJournal(world.herbSightings, events);
const ambientAudio = createAmbientAudio();

// --- v2の機能(Feature)群 ---
// 一覧はregistry.ts。プレイヤー地点の太陽の高さは毎フレームここへ書き込む
let currentSunElevation = 1;
const director = { mode: 'planet' as 'planet' | 'interior' };
const featureContext: FeatureContext = {
  scene,
  player,
  camera: followCamera.camera,
  world,
  events,
  audio: ambientAudio,
  director,
  sunElevation: () => currentSunElevation,
  input: () => readInput(),
  setView: (viewScene, viewCamera) => effects.setView(viewScene, viewCamera),
};
for (const feature of FEATURES) feature.setup(featureContext);

// --- キー入力 ---
const pressed = new Set<string>();
const trackedKeys = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

window.addEventListener('keydown', (event) => {
  if (trackedKeys.has(event.code)) {
    pressed.add(event.code);
    event.preventDefault(); // 矢印キーでページがスクロールしないようにする
  }
});
window.addEventListener('keyup', (event) => {
  pressed.delete(event.code);
});
window.addEventListener('blur', () => {
  pressed.clear(); // ウィンドウからフォーカスが外れたら安全のため停止
});

// --- 仮想スティック(タッチ端末用の移動入力) ---
// 表示の出し分けはCSS(pointer: coarse のときだけ表示)で行う
const joystick = document.querySelector<HTMLDivElement>('#joystick')!;
const joystickKnob = document.querySelector<HTMLDivElement>('#joystick-knob')!;
const JOYSTICK_RANGE = 40; // ノブの可動半径(px)
const JOYSTICK_DEADZONE = 0.2; // 遊び(誤反応防止)
let stickX = 0;
let stickZ = 0;
let stickPointerId: number | null = null;

joystick.addEventListener('pointerdown', (event) => {
  stickPointerId = event.pointerId;
  try {
    // 指がスティックの外へ出ても追従できるようにする
    joystick.setPointerCapture(event.pointerId);
  } catch {
    // 合成イベント(テスト)ではキャプチャできなくてよい
  }
  event.preventDefault();
});
joystick.addEventListener('pointermove', (event) => {
  if (event.pointerId !== stickPointerId) return;
  const rect = joystick.getBoundingClientRect();
  let dx = event.clientX - (rect.left + rect.width / 2);
  let dy = event.clientY - (rect.top + rect.height / 2);
  const length = Math.hypot(dx, dy);
  if (length > JOYSTICK_RANGE) {
    dx *= JOYSTICK_RANGE / length;
    dy *= JOYSTICK_RANGE / length;
  }
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  stickX = dx / JOYSTICK_RANGE;
  stickZ = -dy / JOYSTICK_RANGE; // 画面の上方向 = 奥
});
const releaseStick = (event: PointerEvent) => {
  if (event.pointerId !== stickPointerId) return;
  stickPointerId = null;
  stickX = 0;
  stickZ = 0;
  joystickKnob.style.transform = 'translate(0, 0)';
};
joystick.addEventListener('pointerup', releaseStick);
joystick.addEventListener('pointercancel', releaseStick);

// カメラ相対の入力:W/S = 画面の奥/手前、A/D = 画面の左/右。
// キーボードと仮想スティックの両方を合成する
function readInput(): PlayerInput {
  let x = 0;
  let z = 0;
  if (pressed.has('KeyW') || pressed.has('ArrowUp')) z += 1;
  if (pressed.has('KeyS') || pressed.has('ArrowDown')) z -= 1;
  if (pressed.has('KeyA') || pressed.has('ArrowLeft')) x -= 1;
  if (pressed.has('KeyD') || pressed.has('ArrowRight')) x += 1;
  if (Math.hypot(stickX, stickZ) > JOYSTICK_DEADZONE) {
    x += stickX;
    z += stickZ;
  }
  return {
    x: THREE.MathUtils.clamp(x, -1, 1),
    z: THREE.MathUtils.clamp(z, -1, 1),
  };
}

// --- リサイズ対応 ---
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  effects.setSize(window.innerWidth, window.innerHeight);
  followCamera.resize(window.innerWidth / window.innerHeight);
});

// 開発時のみ:ブラウザのコンソールから位置を確認できるようにする
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__player = player.mesh;
}

// --- メインループ ---
const timer = new THREE.Timer();
const cameraDirection = new THREE.Vector3(); // カメラの「画面の奥」方向(使い回し)
const playerDirection = new THREE.Vector3(); // プレイヤーの球面法線(使い回し)

renderer.setAnimationLoop(() => {
  timer.update();
  // タブが非アクティブだった直後などに大きな deltaTime が来ても
  // 一気にワープしないよう上限を設ける
  const deltaTime = Math.min(timer.getDelta(), 0.1);

  const input = readInput();

  // 星の上にいる間だけ、球面移動・カメラ・世界・つぶやき・図鑑を動かす
  // (家の中では home 機能がプレイヤーの平面移動を担う)
  if (director.mode === 'planet') {
    // カメラ相対移動:前フレームのカメラの視線方向を基準に入力を解釈する
    player.update(deltaTime, input, followCamera.getViewDirection(cameraDirection));
    followCamera.update(deltaTime, player);
    // プレイヤー位置は、遠くのNPC・動物を止める距離カリングに使う
    world.update(timer.getElapsed(), player.mesh.position);

    playerDirection.copy(player.mesh.position).normalize();
    currentSunElevation = getSunElevation(playerDirection);
    speechBubbles.setHidden(false);
    speechBubbles.update(deltaTime, player.mesh.position, currentSunElevation);
    journal.update(deltaTime, playerDirection);
  } else {
    // 家の中ではつぶやきの更新が止まるため、凍った吹き出しを画面に残さない
    speechBubbles.setHidden(true);
  }

  // 音は家の中でも続ける(BGM・環境音。昼夜は星にいたときの値を保つ)
  ambientAudio.update(deltaTime, input.x !== 0 || input.z !== 0, currentSunElevation);

  // v2の機能群を更新する
  for (const feature of FEATURES) feature.update?.(deltaTime, featureContext);

  effects.render(); // ポストプロセス込みで描画する
});
