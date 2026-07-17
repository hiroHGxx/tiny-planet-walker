import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createJournal, HERB_SPECIES, type HerbSighting } from './journal.ts';

/**
 * 薬草図鑑の発見判定と保存を検証する。
 * 表示(DOM)は happy-dom 上で組み立てられるが、見た目の検証はしない。
 */

const UP = new THREE.Vector3(0, 1, 0);

/** 真上に「まるば草」が1株だけある星 */
function singleSighting(): HerbSighting[] {
  return [{ direction: UP.clone(), species: 'roundleaf' }];
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('薬草図鑑', () => {
  it('近づいた薬草の種類が記録される', () => {
    const journal = createJournal(singleSighting());
    expect(journal.discoveredCount()).toBe(0);
    // 株のほぼ真上に立つ(表面距離 ≈ 0)
    journal.update(0.016, UP.clone());
    expect(journal.discoveredCount()).toBe(1);
  });

  it('離れている薬草は記録されない', () => {
    const journal = createJournal(singleSighting());
    // 星の反対側に立つ
    journal.update(0.016, new THREE.Vector3(0, -1, 0));
    expect(journal.discoveredCount()).toBe(0);
  });

  it('見つけた種類はlocalStorageに保存され、次回へ引き継がれる', () => {
    const journal = createJournal(singleSighting());
    journal.update(0.016, UP.clone());
    expect(journal.discoveredCount()).toBe(1);
    // 次に遊ぶとき(=作り直したとき)も発見済みのまま
    const nextSession = createJournal(singleSighting());
    expect(nextSession.discoveredCount()).toBe(1);
  });

  it('同じ種類を何株見つけても記録は1つ', () => {
    const journal = createJournal([
      { direction: UP.clone(), species: 'roundleaf' },
      { direction: UP.clone(), species: 'roundleaf' },
    ]);
    journal.update(0.016, UP.clone());
    journal.update(0.016, UP.clone());
    expect(journal.discoveredCount()).toBe(1);
  });

  it('図鑑の種類IDに重複がない', () => {
    const ids = HERB_SPECIES.map((species) => species.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
