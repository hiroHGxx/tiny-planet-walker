/**
 * 調合レシピ。resultはitems.tsのアイテムID、needsは材料(薬草)のIDと数。
 * レシピを増やすときはここに足すだけで調合台に並ぶ。
 */

export interface RecipeDef {
  id: string;
  /** できあがるアイテム(items.tsのID) */
  result: string;
  /** 材料 */
  needs: ReadonlyArray<{ item: string; count: number }>;
  /** レシピ帳に添える薬師のメモ */
  note: string;
}

export const RECIPES: ReadonlyArray<RecipeDef> = [
  {
    id: 'r_tea_starflower',
    result: 'tea_starflower',
    needs: [{ item: 'starflower', count: 2 }],
    note: '乾かしたほしばなを、ことこと。熱をやわらげるやさしいお茶。',
  },
  {
    id: 'r_salve_roundleaf',
    result: 'salve_roundleaf',
    needs: [{ item: 'roundleaf', count: 3 }],
    note: 'まるば草をすりつぶして練る、薬屋の基本のき。切り傷・すり傷に。',
  },
  {
    id: 'r_syrup_berry',
    result: 'syrup_berry',
    needs: [
      { item: 'berry', count: 2 },
      { item: 'smallflower', count: 1 },
    ],
    note: '甘い実を煮つめて、のばなの香りをひとさじ。せき止めのシロップ。',
  },
  {
    id: 'r_balm_glow',
    result: 'balm_glow',
    needs: [
      { item: 'glow', count: 2 },
      { item: 'rosette', count: 1 },
    ],
    note: 'ひかり草のほのあかりを閉じこめた塗り薬。冷えた体をあたためる。',
  },
  {
    id: 'r_drops_bud',
    result: 'drops_bud',
    needs: [
      { item: 'bud', count: 2 },
      { item: 'starflower', count: 1 },
    ],
    note: 'つぼみ草の朝露を集めた目薬。星を見すぎて疲れた目に。',
  },
];

/** いまの持ち物でこのレシピを作れるか */
export function canCraft(
  recipe: RecipeDef,
  countOf: (item: string) => number
): boolean {
  return recipe.needs.every((need) => countOf(need.item) >= need.count);
}
