/**
 * 星ごとの生態。どの薬草がどの星に生えるかをここで決める。
 * 固有薬草があるので、図鑑12種をそろえるには旅が必要になる。
 * (worldの群生地と掲示板のお手伝いが両方これを参照する)
 */

const BASE = [
  'roundleaf',
  'starflower',
  'glow',
  'berry',
  'smallflower',
  'rosette',
  'bud',
];

export const PLANET_HERBS: Readonly<Record<number, ReadonlyArray<string>>> = {
  1: [...BASE, 'kogane', 'suzufuri'], // 薬草の星:基本+こがね穂・すずふり草
  2: [...BASE, 'kogane', 'akane', 'tsukishiro'], // こもれびの星:あかね草と月しろ草の故郷
  3: [...BASE, 'suzufuri', 'tsukishiro', 'murakinoko'], // しんじゅの星:むらさき茸の故郷
};
