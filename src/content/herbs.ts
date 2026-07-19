import type * as THREE from 'three';
import {
  createRoundLeafHerb,
  createStarFlowerHerb,
  createGlowHerb,
  createBerryHerb,
  createSmallFlower,
  createRosetteHerb,
  createBudHerb,
  createTsukishiroHerb,
  createAkaneHerb,
  createSuzufuriHerb,
  createMurasakiMushroom,
  createKoganeHerb,
  createSakuraHerb,
  createWakabaHerb,
  createShiokazeHerb,
  createHimawariHerb,
  createMomijiMushroom,
  createKuriHerb,
  createYukiwariHerb,
  createKooriHerb,
} from '../flora.ts';

/**
 * 薬草の台帳(1薬草=1エントリ)。
 * 図鑑の名前・説明、挿絵SVG、株のメッシュを作る工場をここに集約する。
 * 薬草を増やすときは flora.ts に工場を書き、ここに1エントリ足し、
 * content/planets.ts の herbs(生える星)へ id を足すだけでよい
 * (図鑑・ポーチ・依頼・群生地はすべてこの台帳から自動でついてくる)。
 * 挿絵の色は palette.ts の植物色(茎・葉・花びら・実)に合わせている。
 */

export interface HerbDef {
  id: string;
  name: string;
  /** 図鑑に添える説明文 */
  note: string;
  /** 図鑑・ポーチの挿絵(インラインSVG。画像ファイルは使わない方針) */
  icon: string;
  /** 株のメッシュを作る工場(flora.ts) */
  factory: (rand: () => number) => THREE.Group;
}

export const HERBS: ReadonlyArray<HerbDef> = [
  {
    id: 'roundleaf',
    name: 'まるば草',
    note: '丸い葉の薬草。すりつぶすと傷薬になる、薬屋の基本のき。',
    factory: createRoundLeafHerb,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M20 36 V12 M20 30 Q14 27 10 22 M20 26 Q26 24 30 20" fill="none" stroke="#4c7a3d" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="20" cy="9" r="5.5" fill="#79ad63"/>
    <circle cx="9" cy="19" r="4.5" fill="#54793f"/>
    <circle cx="31" cy="17" r="4.5" fill="#79ad63"/>
  </svg>`,
  },
  {
    id: 'starflower',
    name: 'ほしばな',
    note: '星のかたちに咲く花。乾かしてお茶にすると熱をやわらげる。',
    factory: createStarFlowerHerb,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M20 36 V18" fill="none" stroke="#4c7a3d" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M20 33 Q14 31 12 26" fill="none" stroke="#4c7a3d" stroke-width="2" stroke-linecap="round"/>
    <g fill="#f5efd7">
      <ellipse cx="20" cy="7" rx="3" ry="6.5" transform="rotate(0 20 13)"/>
      <ellipse cx="20" cy="7" rx="3" ry="6.5" transform="rotate(72 20 13)"/>
      <ellipse cx="20" cy="7" rx="3" ry="6.5" transform="rotate(144 20 13)"/>
      <ellipse cx="20" cy="7" rx="3" ry="6.5" transform="rotate(216 20 13)"/>
      <ellipse cx="20" cy="7" rx="3" ry="6.5" transform="rotate(288 20 13)"/>
    </g>
    <circle cx="20" cy="13" r="3.4" fill="#e8c94f"/>
  </svg>`,
  },
  {
    id: 'glow',
    name: 'ひかり草',
    note: '夜にほんのり光るふしぎな草。まわりに小さな光の粒が漂う。',
    factory: createGlowHerb,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M20 36 Q19 24 20 16" fill="none" stroke="#4c7a3d" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="20" cy="12" r="9" fill="#d9ef7c" opacity="0.25"/>
    <circle cx="20" cy="12" r="5" fill="#d9ef7c"/>
    <circle cx="8" cy="8" r="1.3" fill="#d9ef7c" opacity="0.8"/>
    <circle cx="32" cy="15" r="1.3" fill="#d9ef7c" opacity="0.8"/>
    <circle cx="29" cy="5" r="1" fill="#d9ef7c" opacity="0.6"/>
  </svg>`,
  },
  {
    id: 'berry',
    name: 'すずなり草',
    note: '細い茎の先に丸い実がつく。甘い実はせき止めシロップの材料。',
    factory: createBerryHerb,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M18 36 Q16 20 22 10 M22 10 Q26 8 30 10 M22 10 Q22 6 25 4" fill="none" stroke="#4c7a3d" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="31" cy="13" r="3.6" fill="#e8c94f"/>
    <circle cx="26" cy="6" r="3.2" fill="#d9ef7c"/>
    <circle cx="18" cy="14" r="3" fill="#e8c94f"/>
    <path d="M18 30 Q12 28 9 23" fill="none" stroke="#54793f" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  },
  {
    id: 'smallflower',
    name: 'のばな',
    note: '白と黄色の小さな花。薬の苦味をやわらげる香りづけに使う。',
    factory: createSmallFlower,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M14 36 Q13 26 13 20 M26 36 Q27 28 27 23" fill="none" stroke="#4c7a3d" stroke-width="2.2" stroke-linecap="round"/>
    <g fill="#f5efd7">
      <circle cx="13" cy="12" r="2.6"/><circle cx="9" cy="16" r="2.6"/><circle cx="17" cy="16" r="2.6"/>
      <circle cx="10" cy="20" r="2.6"/><circle cx="16" cy="20" r="2.6"/>
    </g>
    <circle cx="13" cy="16.5" r="2.4" fill="#e8c94f"/>
    <g fill="#f5efd7">
      <circle cx="27" cy="16" r="2.2"/><circle cx="24" cy="19" r="2.2"/><circle cx="30" cy="19" r="2.2"/>
      <circle cx="25" cy="22.5" r="2.2"/><circle cx="29" cy="22.5" r="2.2"/>
    </g>
    <circle cx="27" cy="19.5" r="2" fill="#e8c94f"/>
  </svg>`,
  },
  {
    id: 'rosette',
    name: 'ねざし草',
    note: '地面にぴったりと葉を広げる。根を煎じるとおなかの薬になる。',
    factory: createRosetteHerb,
    icon: `<svg viewBox="0 0 40 40">
    <g>
      <ellipse cx="20" cy="24" rx="3.2" ry="8" transform="rotate(-70 20 31)" fill="#54793f"/>
      <ellipse cx="20" cy="23" rx="3.2" ry="8.5" transform="rotate(-35 20 31)" fill="#79ad63"/>
      <ellipse cx="20" cy="22" rx="3.4" ry="9" fill="#54793f"/>
      <ellipse cx="20" cy="23" rx="3.2" ry="8.5" transform="rotate(35 20 31)" fill="#79ad63"/>
      <ellipse cx="20" cy="24" rx="3.2" ry="8" transform="rotate(70 20 31)" fill="#54793f"/>
    </g>
    <circle cx="20" cy="30" r="3" fill="#79ad63"/>
  </svg>`,
  },
  {
    id: 'bud',
    name: 'つぼみ草',
    note: 'ずっとつぼみのままの草。しずくのなかに朝露をためている。',
    factory: createBudHerb,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M20 36 V22 M20 30 Q15 28 12 24" fill="none" stroke="#4c7a3d" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M20 6 C13.5 14 14 20 20 22 C26 20 26.5 14 20 6 Z" fill="#d9ef7c"/>
    <circle cx="17.5" cy="13" r="1.6" fill="#f5efd7" opacity="0.9"/>
  </svg>`,
  },
  {
    id: 'tsukishiro',
    name: '月しろ草',
    note: '三日月のかたちの白い花。眠りの薬の大切な材料になる。',
    factory: createTsukishiroHerb,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M20 36 V16" fill="none" stroke="#4c7a3d" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M25 6 A8.5 8.5 0 1 0 25 19 A6.5 6.5 0 1 1 25 6 Z" fill="#f5efd7"/>
    <circle cx="27" cy="9" r="1" fill="#f5efd7" opacity="0.7"/>
  </svg>`,
  },
  {
    id: 'akane',
    name: 'あかね草',
    note: '夕焼け色の葉が重なる草。体をあたためる塗り薬になる。',
    factory: createAkaneHerb,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M20 36 V14" fill="none" stroke="#4c7a3d" stroke-width="2.4" stroke-linecap="round"/>
    <ellipse cx="13" cy="26" rx="6" ry="2.8" fill="#c75b4a" transform="rotate(-18 13 26)"/>
    <ellipse cx="27" cy="24" rx="6" ry="2.8" fill="#d0763f" transform="rotate(18 27 24)"/>
    <ellipse cx="14" cy="17" rx="5" ry="2.5" fill="#d0763f" transform="rotate(-22 14 17)"/>
    <ellipse cx="26" cy="15" rx="5" ry="2.5" fill="#c75b4a" transform="rotate(22 26 15)"/>
    <ellipse cx="20" cy="9" rx="4" ry="2.4" fill="#c75b4a"/>
  </svg>`,
  },
  {
    id: 'suzufuri',
    name: 'すずふり草',
    note: '鈴のような花が下向きに咲く。うがい薬にすると喉にやさしい。',
    factory: createSuzufuriHerb,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M14 36 Q13 18 20 10 Q26 6 31 9" fill="none" stroke="#4c7a3d" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M19 16 L23 16 L24.5 22 Q21 24 17.5 22 Z" fill="#f5efd7"/>
    <path d="M26 12 L30 12 L31.5 18 Q28 20 24.5 18 Z" fill="#f5efd7"/>
    <circle cx="21" cy="23.5" r="1.1" fill="#e8c94f"/><circle cx="28" cy="19.5" r="1.1" fill="#e8c94f"/>
  </svg>`,
  },
  {
    id: 'murakinoko',
    name: 'むらさき茸',
    note: '紫の傘のふしぎなキノコ。少量なら痛み止めになる。',
    factory: createMurasakiMushroom,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M17 36 V24 M25 34 V26" fill="none" stroke="#e8e0cc" stroke-width="4" stroke-linecap="round"/>
    <path d="M8 24 Q17 8 26 24 Z" fill="#9a6fb8"/>
    <path d="M19 26 Q25 15 31 26 Z" fill="#835a9e"/>
    <circle cx="14" cy="20" r="1.2" fill="#e6d8f2"/><circle cx="20" cy="17" r="1.2" fill="#e6d8f2"/>
  </svg>`,
  },
  {
    id: 'kogane',
    name: 'こがね穂',
    note: '金色の実の穂。煮つめると、やさしい甘さの飴になる。',
    factory: createKoganeHerb,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M15 36 Q14 22 16 12 M25 36 Q26 24 24 14" fill="none" stroke="#4c7a3d" stroke-width="2.2" stroke-linecap="round"/>
    <g fill="#e8c94f">
      <ellipse cx="16" cy="11" rx="2" ry="3"/><ellipse cx="13" cy="15" rx="2" ry="3"/><ellipse cx="19" cy="15" rx="2" ry="3"/>
      <ellipse cx="24" cy="13" rx="2" ry="3"/><ellipse cx="21" cy="17" rx="2" ry="3"/><ellipse cx="27" cy="17" rx="2" ry="3"/>
    </g>
  </svg>`,
  },
  {
    id: 'sakura',
    name: 'さくら草',
    note: '桃色の花びらの春の花。香りをうつした湯は心をほぐす。',
    factory: createSakuraHerb,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M20 36 V18" fill="none" stroke="#4c7a3d" stroke-width="2.4" stroke-linecap="round"/>
    <g fill="#f2b3ce">
      <ellipse cx="20" cy="8" rx="3.4" ry="6" transform="rotate(0 20 13)"/>
      <ellipse cx="20" cy="8" rx="3.4" ry="6" transform="rotate(72 20 13)"/>
      <ellipse cx="20" cy="8" rx="3.4" ry="6" transform="rotate(144 20 13)"/>
      <ellipse cx="20" cy="8" rx="3.4" ry="6" transform="rotate(216 20 13)"/>
      <ellipse cx="20" cy="8" rx="3.4" ry="6" transform="rotate(288 20 13)"/>
    </g>
    <circle cx="20" cy="13" r="3" fill="#f7dfe8"/>
  </svg>`,
  },
  {
    id: 'wakaba',
    name: 'わかば草',
    note: '芽吹いたばかりの若葉。朝露ごと摘むと元気の出る薬になる。',
    factory: createWakabaHerb,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M20 36 V22" fill="none" stroke="#4c7a3d" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M20 22 Q12 18 10 9 Q19 10 20 20 Z" fill="#9fd379"/>
    <path d="M20 22 Q28 18 30 9 Q21 10 20 20 Z" fill="#79ad63"/>
    <circle cx="27" cy="12" r="1.8" fill="#dfeef7"/>
  </svg>`,
  },
  {
    id: 'shiokaze',
    name: 'しおかぜ草',
    note: '浜辺で潮風にゆれる草。ほのかな塩けがのどの薬に効く。',
    factory: createShiokazeHerb,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M20 34 Q17 22 10 14 M20 34 Q20 20 18 10 M20 34 Q24 22 30 12 M20 34 Q27 26 33 22"
      fill="none" stroke="#84bfa2" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M12 33 Q14 29 18 30 Q17 34 12 33 Z" fill="#f5efd7"/>
  </svg>`,
  },
  {
    id: 'himawari',
    name: 'ひまわり草',
    note: '小さなひまわり。日ざしをためた種は体をあたためる。',
    factory: createHimawariHerb,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M20 36 V20 M20 30 Q14 28 12 23" fill="none" stroke="#4c7a3d" stroke-width="2.4" stroke-linecap="round"/>
    <g fill="#f0c53f">
      <ellipse cx="20" cy="6" rx="2.6" ry="5" transform="rotate(0 20 12)"/>
      <ellipse cx="20" cy="6" rx="2.6" ry="5" transform="rotate(45 20 12)"/>
      <ellipse cx="20" cy="6" rx="2.6" ry="5" transform="rotate(90 20 12)"/>
      <ellipse cx="20" cy="6" rx="2.6" ry="5" transform="rotate(135 20 12)"/>
      <ellipse cx="20" cy="6" rx="2.6" ry="5" transform="rotate(180 20 12)"/>
      <ellipse cx="20" cy="6" rx="2.6" ry="5" transform="rotate(225 20 12)"/>
      <ellipse cx="20" cy="6" rx="2.6" ry="5" transform="rotate(270 20 12)"/>
      <ellipse cx="20" cy="6" rx="2.6" ry="5" transform="rotate(315 20 12)"/>
    </g>
    <circle cx="20" cy="12" r="4.2" fill="#6d4a2f"/>
  </svg>`,
  },
  {
    id: 'momijitake',
    name: 'もみじ茸',
    note: '紅葉色の傘のきのこ。干すと、よく眠れるお香になる。',
    factory: createMomijiMushroom,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M16 36 V25 M26 34 V27" fill="none" stroke="#e8e0cc" stroke-width="4" stroke-linecap="round"/>
    <path d="M7 25 Q16 9 25 25 Z" fill="#c75b4a"/>
    <path d="M20 27 Q26 16 32 27 Z" fill="#d0763f"/>
    <circle cx="13" cy="21" r="1.2" fill="#f5efd7"/><circle cx="19" cy="18" r="1.2" fill="#f5efd7"/>
  </svg>`,
  },
  {
    id: 'kuri',
    name: 'くりの実',
    note: 'いがから顔を出した栗。ゆでてつぶせば力の出る薬膳に。',
    factory: createKuriHerb,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M10 26 L13 21 L16 26 L20 20 L24 26 L27 21 L30 26 Q30 33 20 33 Q10 33 10 26 Z" fill="#b0a05e"/>
    <path d="M20 10 Q26 14 26 20 Q26 25 20 25 Q14 25 14 20 Q14 14 20 10 Z" fill="#8a5a36"/>
    <ellipse cx="20" cy="24" rx="4.5" ry="1.6" fill="#e8dbc0"/>
  </svg>`,
  },
  {
    id: 'yukiwari',
    name: 'ゆきわり草',
    note: '雪のあいだから咲く白い花。冬のはじまりを告げる薬草。',
    factory: createYukiwariHerb,
    icon: `<svg viewBox="0 0 40 40">
    <ellipse cx="20" cy="33" rx="11" ry="3.5" fill="#f2f6f8"/>
    <path d="M20 32 V18" fill="none" stroke="#4c7a3d" stroke-width="2.2" stroke-linecap="round"/>
    <g fill="#fffcf2">
      <ellipse cx="20" cy="10" rx="2.6" ry="5" transform="rotate(0 20 14)"/>
      <ellipse cx="20" cy="10" rx="2.6" ry="5" transform="rotate(72 20 14)"/>
      <ellipse cx="20" cy="10" rx="2.6" ry="5" transform="rotate(144 20 14)"/>
      <ellipse cx="20" cy="10" rx="2.6" ry="5" transform="rotate(216 20 14)"/>
      <ellipse cx="20" cy="10" rx="2.6" ry="5" transform="rotate(288 20 14)"/>
    </g>
    <circle cx="20" cy="14" r="2.6" fill="#e8c94f"/>
  </svg>`,
  },
  {
    id: 'koori',
    name: 'こおり花',
    note: '氷のように透きとおる花。とかした水は熱さましの特効薬。',
    factory: createKooriHerb,
    icon: `<svg viewBox="0 0 40 40">
    <path d="M20 34 V24" fill="none" stroke="#4c7a3d" stroke-width="2.2" stroke-linecap="round"/>
    <g fill="#bfe0f2">
      <path d="M20 22 L16 12 L20 6 L24 12 Z"/>
      <path d="M20 22 L11 18 L8 12 L17 15 Z"/>
      <path d="M20 22 L29 18 L32 12 L23 15 Z"/>
    </g>
    <circle cx="20" cy="21" r="3" fill="#e8f4fb"/>
  </svg>`,
  },
];

/** idから台帳を引く(群生地の生成・図鑑などが使う) */
export const HERB_BY_ID: ReadonlyMap<string, HerbDef> = new Map(
  HERBS.map((herb) => [herb.id, herb])
);
