/**
 * 機能間をつなぐ型付きイベントバス。
 * 発火側は購読者がゼロでも困らないため、機能を消しても発火側は壊れない。
 * イベントを増やすときは GameEvents に型を足すだけでよい。
 */

export interface GameEvents {
  /** タイトル画面で「はじめる」が押された */
  'game-started': Record<string, never>;
  /** 図鑑に新しい薬草が記録された */
  'herb-discovered': { species: string };
  /** 何かを摘んだ・採った */
  'item-picked': { item: string };
  /** ポーチの中身が変わった */
  'item-changed': { item: string; count: number };
  /** ゲーム内の日付が進んだ(太陽が昇った回数) */
  'day-passed': { day: number };
  /** 依頼を受けた */
  'quest-started': { questId: string };
  /** 依頼を果たした */
  'quest-completed': { questId: string };
  /** 調合台で薬を作った */
  'craft-done': { recipeId: string };
  /** 星の上 ⇄ 家の中 の切り替えが起きた */
  'scene-changed': { scene: 'planet' | 'interior' };
}

export type GameEventType = keyof GameEvents;

type Listener<K extends GameEventType> = (payload: GameEvents[K]) => void;

export class EventBus {
  private readonly listeners = new Map<GameEventType, Set<Listener<never>>>();

  /** 購読する。戻り値を呼ぶと解除できる */
  on<K extends GameEventType>(type: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener<never>);
    return () => set.delete(listener as Listener<never>);
  }

  emit<K extends GameEventType>(type: K, payload: GameEvents[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    // 購読解除がループ中に起きても安全なようコピーしてから呼ぶ
    for (const listener of [...set]) (listener as Listener<K>)(payload);
  }
}
