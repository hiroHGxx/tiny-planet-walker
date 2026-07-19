import { HERB_SPECIES, HERB_ICONS } from '../journal.ts';

/**
 * ポーチに入るアイテムの台帳。
 * 薬草(図鑑と同じ7種)+調合で作る薬。挿絵はすべてコード生成のSVG。
 * アイテムを増やすときはここに足せば、ポーチ・調合・依頼から共通で使える。
 */

export interface ItemDef {
  id: string;
  name: string;
  /** 挿絵(インラインSVG文字列) */
  icon: string;
}

/** 薬瓶の挿絵を色違いで作る(調合品用) */
function bottleIcon(liquid: string, cap: string): string {
  return `<svg viewBox="0 0 40 40">
    <path d="M16 10 H24 V16 Q30 20 30 27 Q30 34 20 34 Q10 34 10 27 Q10 20 16 16 Z" fill="#e8e4d4" opacity="0.55"/>
    <path d="M12.5 24 Q13 20.5 16.5 18 H23.5 Q27 20.5 27.5 24 Q28 31.5 20 31.5 Q12 31.5 12.5 24 Z" fill="${liquid}"/>
    <rect x="15.5" y="6" width="9" height="5" rx="1.5" fill="${cap}"/>
    <circle cx="16" cy="22" r="1.4" fill="#ffffff" opacity="0.65"/>
  </svg>`;
}

/** 湯のみ(お茶)の挿絵 */
function teaIcon(liquid: string): string {
  return `<svg viewBox="0 0 40 40">
    <path d="M9 16 H31 Q30 30 20 30 Q10 30 9 16 Z" fill="#f5efd7"/>
    <ellipse cx="20" cy="16" rx="11" ry="3" fill="${liquid}"/>
    <path d="M14 9 Q15 11 14 13 M20 8 Q21 10 20 12 M26 9 Q27 11 26 13" stroke="#c7c0d6" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="20" cy="31.5" rx="8" ry="1.8" fill="#d8cfae"/>
  </svg>`;
}

/** 軟膏壺の挿絵 */
function jarIcon(body: string): string {
  return `<svg viewBox="0 0 40 40">
    <path d="M11 15 Q9 24 12 29 Q14 32 20 32 Q26 32 28 29 Q31 24 29 15 Z" fill="${body}"/>
    <rect x="10.5" y="10" width="19" height="6" rx="2.4" fill="#a1794f"/>
    <circle cx="16" cy="21" r="1.6" fill="#ffffff" opacity="0.5"/>
  </svg>`;
}

/** 調合で作る薬(レシピの成果物) */
export const POTIONS: ReadonlyArray<ItemDef> = [
  { id: 'tea_starflower', name: 'ほしばなのお茶', icon: teaIcon('#e8c94f') },
  { id: 'salve_roundleaf', name: 'まるば軟膏', icon: jarIcon('#79ad63') },
  { id: 'syrup_berry', name: 'すずなりシロップ', icon: bottleIcon('#e8c94f', '#c75b4a') },
  { id: 'balm_glow', name: 'ひかりの塗り薬', icon: jarIcon('#d9ef7c') },
  { id: 'drops_bud', name: 'つぼみのしずく', icon: bottleIcon('#9fc9dd', '#4c7a3d') },
  { id: 'warm_pack', name: 'あったか湿布', icon: jarIcon('#d0763f') },
  { id: 'moon_tea', name: '月しろのお茶', icon: teaIcon('#cfdcff') },
  { id: 'akane_balm', name: 'あかねの塗り薬', icon: jarIcon('#c75b4a') },
  { id: 'suzu_gargle', name: 'すずふりのうがい薬', icon: bottleIcon('#bcd8e6', '#79ad63') },
  { id: 'kogane_candy', name: 'こがね飴', icon: bottleIcon('#e8c94f', '#a1794f') },
  // 季節の依頼章(chapter4)のごちそう
  { id: 'sakura_yu', name: 'さくら湯', icon: teaIcon('#f2b3ce') },
  { id: 'shiokaze_cider', name: 'しおかぜサイダー', icon: bottleIcon('#9fd8e8', '#4fb3d9') },
  { id: 'kuri_kanroni', name: 'くりの甘露煮', icon: jarIcon('#b08968') },
  { id: 'yukidoke_soup', name: 'ゆきどけスープ', icon: teaIcon('#cfe6dc') },
];

/** 採取・お手伝いで手に入るもの(薬草・薬以外) */
export const GOODS: ReadonlyArray<ItemDef> = [
  {
    id: 'wool',
    name: 'ひつじの毛',
    icon: `<svg viewBox="0 0 40 40">
      <circle cx="15" cy="20" r="7.5" fill="#f5efd7"/><circle cx="24" cy="16" r="7" fill="#fffcf2"/>
      <circle cx="26" cy="24" r="6.5" fill="#f5efd7"/><circle cx="18" cy="26" r="6" fill="#fffcf2"/>
    </svg>`,
  },
  {
    id: 'water',
    name: '湖の水',
    icon: `<svg viewBox="0 0 40 40">
      <path d="M13 8 H27 L25 32 Q20 34 15 32 Z" fill="#bcd8e6"/>
      <path d="M14.5 18 H25.5 L24.7 31 Q20 32.8 15.8 31 Z" fill="#74aec9"/>
      <ellipse cx="20" cy="8" rx="7" ry="2" fill="#dfeaf2"/>
    </svg>`,
  },
  {
    id: 'seed_mix',
    name: 'ふしぎな種',
    icon: `<svg viewBox="0 0 40 40">
      <path d="M12 10 Q10 24 20 26 Q30 24 28 10 Q20 16 12 10 Z" fill="#b08968"/>
      <circle cx="17" cy="17" r="1.6" fill="#6d4a2f"/><circle cx="23" cy="15" r="1.4" fill="#6d4a2f"/>
      <circle cx="20" cy="21" r="1.4" fill="#6d4a2f"/>
    </svg>`,
  },
];

/** すべてのアイテム(薬草+薬+採取物) */
export const ITEMS: ReadonlyArray<ItemDef> = [
  ...HERB_SPECIES.map((species) => ({
    id: species.id,
    name: species.name,
    icon: HERB_ICONS[species.id] ?? '',
  })),
  ...POTIONS,
  ...GOODS,
];

const byId = new Map(ITEMS.map((item) => [item.id, item]));

export function itemName(id: string): string {
  return byId.get(id)?.name ?? id;
}

export function itemIcon(id: string): string {
  return byId.get(id)?.icon ?? '';
}
