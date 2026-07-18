import type * as THREE from 'three';
import type { Player } from '../player.ts';
import type { World } from '../world.ts';
import type { AmbientAudio } from '../audio.ts';
import type { EventBus } from './events.ts';

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
  /** プレイヤー地点の太陽の高さ(毎フレーム更新済みの値を返す) */
  sunElevation(): number;
}

export interface Feature {
  /** 機能ID。セーブのキー(tiny-planet-walker:<id>)にも使う */
  id: string;
  setup(ctx: FeatureContext): void;
  update?(deltaTime: number, ctx: FeatureContext): void;
}
