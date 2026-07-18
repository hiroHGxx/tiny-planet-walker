import './style.css';
import * as THREE from 'three';
import { PLANET_RADIUS } from '../../palette.ts';
import type { Feature, FeatureContext } from '../feature.ts';

/**
 * 1ボタンインタラクション基盤(F1)。
 * 世界に「触れられるもの」(Interactable)を登録しておくと、
 * プレイヤーが近づいたとき最寄りの1件だけに紙調のプロンプトが出て、
 * Eキー(タッチでは右下の丸ボタン)で onUse が呼ばれる。
 * 採取・会話・扉など、後続機能すべての土台になる基盤機能。
 * ※基盤のため、後続機能(pouch等)はこのモジュールを直接importしてよい。
 */

export interface Interactable {
  /** 対象がある方向(単位ベクトル)。動くものは呼び出し側が書き換えてよい */
  direction: THREE.Vector3;
  /** この距離まで近づいたら触れられる(星の上=表面距離、室内=直線距離) */
  radius: number;
  /** プロンプトに出す動詞(「摘む」「話す」「入る」など) */
  label: string;
  /** どのシーンにある対象か(省略時は星の上) */
  space?: 'planet' | 'interior';
  /** 室内の対象の位置(space: 'interior' のとき必須。部屋座標) */
  position?: THREE.Vector3;
  /** 同時に届く対象が複数あるときの優先度(大きいほど優先。省略時0) */
  priority?: number;
  /** falseを返す間は対象にならない(摘まれて再生待ちの株など) */
  enabled?: () => boolean;
  onUse: () => void;
}

const interactables = new Set<Interactable>();

/** 触れられるものを登録する。戻り値を呼ぶと登録解除できる */
export function addInteractable(item: Interactable): () => void {
  interactables.add(item);
  return () => interactables.delete(item);
}

// 使い回し用の一時オブジェクト
const _playerDirection = new THREE.Vector3();

let current: Interactable | null = null;
let prompt: HTMLDivElement | null = null;
let promptLabel = '';

export const interactFeature: Feature = {
  id: 'interact',
  setup(): void {
    prompt = document.createElement('div');
    prompt.id = 'interact-prompt';
    document.body.appendChild(prompt);

    // タッチ端末用の実行ボタン(表示の出し分けはCSSで行う)
    const button = document.createElement('button');
    button.id = 'interact-button';
    document.body.appendChild(button);

    const use = () => {
      if (!current) return;
      current.onUse();
    };
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyE' && !event.repeat) use();
    });
    button.addEventListener('pointerdown', (event) => {
      // ボタンの奥のcanvasにカメラドラッグが始まらないようにする
      event.stopPropagation();
      event.preventDefault();
      use();
    });
  },
  update(_deltaTime: number, ctx: FeatureContext): void {
    const mode = ctx.director.mode;
    _playerDirection.copy(ctx.player.mesh.position).normalize();

    // いまのシーンにあり、届く範囲の対象から、優先度が高く・より近いものを1件選ぶ
    let best: Interactable | null = null;
    let bestPriority = -Infinity;
    let bestCloseness = -Infinity;
    for (const item of interactables) {
      if ((item.space ?? 'planet') !== mode) continue;
      if (item.enabled && !item.enabled()) continue;
      // 近さ:星の上では方向のdot、室内では距離の逆符号(どちらも大きいほど近い)
      let closeness: number;
      if (mode === 'planet') {
        closeness = item.direction.dot(_playerDirection);
        if (closeness < Math.cos(item.radius / PLANET_RADIUS)) continue;
      } else {
        const distance = item.position?.distanceTo(ctx.player.mesh.position) ?? Infinity;
        if (distance > item.radius) continue;
        closeness = -distance;
      }
      const priority = item.priority ?? 0;
      if (
        priority > bestPriority ||
        (priority === bestPriority && closeness > bestCloseness)
      ) {
        best = item;
        bestPriority = priority;
        bestCloseness = closeness;
      }
    }

    current = best;
    if (!prompt) return;
    if (!best) {
      prompt.classList.remove('show');
      document.querySelector('#interact-button')?.classList.remove('show');
      return;
    }
    if (promptLabel !== best.label) {
      promptLabel = best.label;
      prompt.innerHTML = '';
      const key = document.createElement('span');
      key.className = 'interact-key';
      key.textContent = 'E';
      prompt.append(key, document.createTextNode(` ${best.label}`));
      const button = document.querySelector('#interact-button');
      if (button) button.textContent = best.label;
    }
    prompt.classList.add('show');
    document.querySelector('#interact-button')?.classList.add('show');
  },
};
