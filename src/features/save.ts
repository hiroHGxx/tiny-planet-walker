/**
 * 機能ごとのセーブ(localStorage)。
 * キーは tiny-planet-walker:<featureId>。バージョン番号を同梱し、
 * 合わなければ黙って初期化する(開発中のリセットは許容する方針)。
 * 保存できない環境(プライベートモード等)では、その回かぎりで遊べればよい。
 */

const PREFIX = 'tiny-planet-walker:';

export function loadFeatureData<T>(featureId: string, version: number): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + featureId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; data?: T };
    if (parsed.v !== version) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function saveFeatureData(featureId: string, version: number, data: unknown): void {
  try {
    localStorage.setItem(PREFIX + featureId, JSON.stringify({ v: version, data }));
  } catch {
    // 保存できなくても遊べるので何もしない
  }
}

/** 「はじめから」用:この作品のセーブをすべて消す */
export function clearAllSaves(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // 消せない環境では何もしない
  }
}
