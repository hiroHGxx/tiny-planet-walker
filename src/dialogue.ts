import * as THREE from 'three';
import { PLANET_RADIUS } from './palette.ts';
import type { Npc } from './npc.ts';

/**
 * 村人のつぶやき。
 * プレイヤーが近づいた村人の頭の上に、短いひとことを吹き出しで出す。
 * 会話UIや選択肢はなく、返事も求めない(眺めるだけの世界を守る)。
 *
 * - 吹き出しはHTMLのレイヤーに重ね、毎フレーム頭上の位置をスクリーンへ投影して追従させる
 * - 太陽が沈んでいる間は夜のつぶやきに変わる
 * - 実行時の Math.random() だけを使い、配置用のシード乱数は消費しない
 *   (配置コードの途中に乱数消費を挟むと星のレイアウトが変わってしまうため)
 */

/** このくらい近づいたらつぶやく(表面距離) */
const TALK_DISTANCE = 2.4;
/** これ以上離れたら途中でも消す(表面距離) */
const FADE_DISTANCE = 3.6;
/** ひとことを表示しておく時間(秒) */
const BUBBLE_DURATION = 4.2;
/** 同時に出す吹き出しの最大数(集落で全員が一斉に話さないように) */
const MAX_ACTIVE = 3;

const DAY_LINES = [
  'いいお天気だねえ',
  'おや、おえんちゃん。おさんぽかい?',
  '薬草のいい匂いがするよ',
  '湖の水、今日はいちだんときれいだ',
  'ひつじの毛はふわふわだよ',
  'この星は、歩くのにちょうどいい大きささ',
  'パンを焼きすぎちゃってね',
  '畑の実、もうすぐ食べごろなんだ',
  'ハチはよく働くねえ',
  '丘の上から見る空が好きでね',
  'ちょうちょを追いかけてたら、星を一周してたよ',
  'まるば草は傷によく効くんだって',
  '今日はいい風だ',
  '洗濯物がよく乾くよ',
  'キノコは食べる前に、おえんちゃんに見せるんだよ',
  '遠くの村まで歩くと、いい昼寝ができるのさ',
  '雲の影が通りすぎていったね',
  '歌でもうたおうかね',
];

const NIGHT_LINES = [
  '星がよく見えるねえ',
  'さっき流れ星を見たよ',
  'ひかり草がともる時間だ',
  'そろそろおやすみの時間かね',
  '夜のさんぽかい? 足元に気をつけて',
  '夜の風は、すこしひんやりするね',
  '静かな夜だねえ',
  'ランタンの灯りがきれいだ',
];

interface BubbleState {
  /** 次につぶやけるようになるまでの時間(秒) */
  cooldown: number;
  element: HTMLDivElement | null;
  age: number;
  timeLeft: number;
  lastLine: string;
}

// 使い回し用の一時オブジェクト
const _anchor = new THREE.Vector3();
const _projected = new THREE.Vector3();
const _npcDirection = new THREE.Vector3();
const _playerDirection = new THREE.Vector3();

export class SpeechBubbles {
  private readonly layer: HTMLDivElement;
  private readonly states: BubbleState[];

  constructor(
    private readonly npcs: readonly Npc[],
    private readonly camera: THREE.PerspectiveCamera
  ) {
    this.layer = document.createElement('div');
    this.layer.id = 'speech-layer';
    document.body.appendChild(this.layer);
    // 最初から全員いっせいに話さないよう、待ち時間をばらけさせる
    this.states = npcs.map(() => ({
      cooldown: Math.random() * 5,
      element: null,
      age: 0,
      timeLeft: 0,
      lastLine: '',
    }));
  }

  /**
   * レイヤーごと表示/非表示を切り替える。
   * 家の中(interior)では update が呼ばれず吹き出しが凍ったまま残るため、
   * シーンを離れるときに隠す(戻れば残り時間から再開する)
   */
  setHidden(hidden: boolean): void {
    this.layer.style.display = hidden ? 'none' : '';
  }

  /** sunElevation はプレイヤー地点での太陽の高さ(1=真昼、-1=真夜中) */
  update(deltaTime: number, playerPosition: THREE.Vector3, sunElevation: number): void {
    _playerDirection.copy(playerPosition).normalize();
    let active = 0;
    for (const state of this.states) if (state.element) active++;

    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i]!;
      const state = this.states[i]!;
      state.cooldown -= deltaTime;

      _npcDirection.copy(npc.mesh.position).normalize();
      const surfaceDistance =
        Math.acos(THREE.MathUtils.clamp(_npcDirection.dot(_playerDirection), -1, 1)) *
        PLANET_RADIUS;

      // 近くにいて、しばらく話していなければ、ひとことつぶやく
      if (
        !state.element &&
        npc.mesh.visible &&
        active < MAX_ACTIVE &&
        state.cooldown <= 0 &&
        surfaceDistance < TALK_DISTANCE
      ) {
        state.element = this.createBubble(pickLine(state, sunElevation));
        state.age = 0;
        state.timeLeft = BUBBLE_DURATION;
        active++;
      }

      if (!state.element) continue;

      state.age += deltaTime;
      state.timeLeft -= deltaTime;
      // 話し終えたか、離れすぎたら消して、しばらく間を置く
      if (state.timeLeft <= 0 || surfaceDistance > FADE_DISTANCE || !npc.mesh.visible) {
        state.element.remove();
        state.element = null;
        state.cooldown = 7 + Math.random() * 7;
        continue;
      }
      this.positionBubble(npc, state);
    }
  }

  private createBubble(line: string): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'speech-bubble';
    element.textContent = line;
    this.layer.appendChild(element);
    return element;
  }

  /** 頭上のワールド座標をスクリーンへ投影して、吹き出しを追従させる */
  private positionBubble(npc: Npc, state: BubbleState): void {
    const element = state.element!;
    npc.getBubbleAnchor(_anchor);
    _projected.copy(_anchor).project(this.camera);
    // カメラの後ろ側にあるときは表示しない
    if (_projected.z > 1) {
      element.style.opacity = '0';
      return;
    }
    element.style.left = `${(_projected.x * 0.5 + 0.5) * window.innerWidth}px`;
    element.style.top = `${(-_projected.y * 0.5 + 0.5) * window.innerHeight}px`;
    // 出るときと消えるときに、ふっとフェードさせる
    element.style.opacity = String(
      Math.min(state.age / 0.25, 1, state.timeLeft / 0.35)
    );
  }
}

/** 昼夜に合わせたセリフをランダムに選ぶ(直前と同じひとことは避ける) */
function pickLine(state: BubbleState, sunElevation: number): string {
  const pool = sunElevation > -0.05 ? DAY_LINES : NIGHT_LINES;
  let line = pool[Math.floor(Math.random() * pool.length)]!;
  if (line === state.lastLine) {
    line = pool[(pool.indexOf(line) + 1) % pool.length]!;
  }
  state.lastLine = line;
  return line;
}
