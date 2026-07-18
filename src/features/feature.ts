import type * as THREE from 'three';
import type { Player, PlayerInput } from '../player.ts';
import type { World } from '../world.ts';
import type { AmbientAudio } from '../audio.ts';
import type { EventBus } from './events.ts';

/**
 * いま表示しているシーン。'planet'=星の上(既存の世界)、'interior'=家の中。
 * mode の書き換えと描画の切り替えは home 機能が行い、
 * main.ts は 'planet' のときだけ星side(プレイヤー球面移動・world等)を更新する。
 */
export interface SceneDirector {
  mode: 'planet' | 'interior';
}

/**
 * v2の機能(Feature)モジュールの共通インターフェース。
 * 1機能=1ディレクトリで作り、registry.ts の配列に登録して使う。
 * 配列から外せば機能が丸ごと消える(=雰囲気に合わなければ捨てられる)構造。
 * 機能同士は直接importせず、イベントバスとセーブを通じてゆるくつながる。
 * 詳細は docs/機能拡張設計書.md を参照。
 */

export interface FeatureContext {
  scene: THREE.Scene;
  player: Player;
  camera: THREE.PerspectiveCamera;
  world: World;
  events: EventBus;
  audio: AmbientAudio;
  director: SceneDirector;
  /** プレイヤー地点の太陽の高さ(毎フレーム更新済みの値を返す) */
  sunElevation(): number;
  /** いまのカメラ相対の移動入力(キー+仮想スティック合成) */
  input(): PlayerInput;
  /** 星side ⇄ 室内side の描画切り替え(effects.setViewへの橋渡し) */
  setView(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
}

export interface Feature {
  /** 機能ID。セーブのキー(tiny-planet-walker:<id>)にも使う */
  id: string;
  setup(ctx: FeatureContext): void;
  update?(deltaTime: number, ctx: FeatureContext): void;
}
