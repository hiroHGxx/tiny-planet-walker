import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllSaves, loadFeatureData, saveFeatureData } from './save.ts';

describe('機能ごとのセーブ', () => {
  beforeEach(() => localStorage.clear());

  it('保存したデータを同じバージョンで読み戻せる', () => {
    saveFeatureData('pouch', 1, { counts: { roundleaf: 2 } });
    expect(loadFeatureData('pouch', 1)).toEqual({ counts: { roundleaf: 2 } });
  });

  it('バージョンが違うと初期化される(nullが返る)', () => {
    saveFeatureData('pouch', 1, { counts: {} });
    expect(loadFeatureData('pouch', 2)).toBeNull();
  });

  it('clearAllSavesはこの作品のキーだけを消す', () => {
    saveFeatureData('clock', 1, { day: 3 });
    localStorage.setItem('ほかのサイトのキー', 'のこる');
    clearAllSaves();
    expect(loadFeatureData('clock', 1)).toBeNull();
    expect(localStorage.getItem('ほかのサイトのキー')).toBe('のこる');
  });
});
