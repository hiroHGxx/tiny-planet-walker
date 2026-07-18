import * as THREE from 'three';
import { PALETTE, THEME, toonMaterial, flatGeometry } from './palette.ts';

/**
 * 薬草・木・岩・小物のファクトリ集。
 * すべて「原点が根元、+Y が上」で組み立てる(placement.ts の前提)。
 * ジオメトリはモジュール内で共有し、オブジェクトごとに new しない。
 */

type Rand = () => number;

// --- 共有ジオメトリ(スケールで大きさを変えて使い回す) ---
const stemGeometry = flatGeometry(new THREE.CylinderGeometry(0.03, 0.05, 1, 5));
const leafGeometry = flatGeometry(new THREE.SphereGeometry(1, 6, 4)); // つぶして葉や花びらにする
const berryGeometry = flatGeometry(new THREE.SphereGeometry(1, 6, 5));
const trunkGeometry = flatGeometry(new THREE.CylinderGeometry(0.14, 0.22, 1, 6));
const coneFoliageGeometry = flatGeometry(new THREE.ConeGeometry(1, 2.2, 7));
const roundFoliageGeometry = flatGeometry(new THREE.SphereGeometry(1, 6, 5));
const chunkFoliageGeometry = flatGeometry(new THREE.DodecahedronGeometry(1, 0));
const rockGeometryA = flatGeometry(new THREE.DodecahedronGeometry(0.5, 0));
const rockGeometryB = flatGeometry(new THREE.IcosahedronGeometry(0.5, 0));
const capGeometry = flatGeometry(new THREE.ConeGeometry(1, 1, 7));
const boxGeometry = flatGeometry(new THREE.BoxGeometry(1, 1, 1));
const potGeometry = flatGeometry(new THREE.CylinderGeometry(0.13, 0.1, 0.2, 7));

/** 茎のメッシュを作る(height は根元からの高さ) */
function createStem(height: number): THREE.Mesh {
  const stem = new THREE.Mesh(stemGeometry, toonMaterial(PALETTE.stem));
  stem.scale.y = height;
  stem.position.y = height / 2;
  return stem;
}

/** 平たくつぶした葉を、茎のまわりに放射状に付ける */
function addLeavesAround(
  group: THREE.Group,
  rand: Rand,
  count: number,
  y: number,
  spread: number,
  leafScale: number,
  color: number
): void {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.6;
    const leaf = new THREE.Mesh(leafGeometry, toonMaterial(color));
    // 球をつぶして「長細い平たい葉」にする(長軸はローカル+Z)
    leaf.scale.set(leafScale * 0.55, leafScale * 0.18, leafScale);
    leaf.position.set(
      Math.cos(angle) * spread,
      y + (rand() - 0.5) * 0.06,
      Math.sin(angle) * spread
    );
    // 葉の長軸(+Z)が茎から外側を向くように回す
    leaf.rotation.y = Math.PI / 2 - angle;
    // 少し外側へ垂らす
    leaf.rotateX(0.35 + rand() * 0.25);
    group.add(leaf);
  }
}

/** 丸い葉の薬草 */
export function createRoundLeafHerb(rand: Rand): THREE.Group {
  const herb = new THREE.Group();
  const height = 0.35 + rand() * 0.15;
  herb.add(createStem(height));
  const leafCount = 3 + Math.floor(rand() * 3); // 3〜5枚
  addLeavesAround(herb, rand, leafCount, height * 0.85, 0.13, 0.22, PALETTE.leaf);
  herb.scale.setScalar(0.8 + rand() * 0.5);
  return herb;
}

/** 星形の花が咲く薬草 */
export function createStarFlowerHerb(rand: Rand): THREE.Group {
  const herb = new THREE.Group();
  const height = 0.5 + rand() * 0.2;
  herb.add(createStem(height));
  // 下のほうに葉を2枚
  addLeavesAround(herb, rand, 2, height * 0.4, 0.1, 0.18, PALETTE.leafDark);
  // 花びら5枚を放射状に並べて星形にする
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const petal = new THREE.Mesh(leafGeometry, toonMaterial(PALETTE.petal));
    petal.scale.set(0.05, 0.015, 0.11);
    petal.position.set(Math.cos(angle) * 0.08, height, Math.sin(angle) * 0.08);
    petal.rotation.y = Math.PI / 2 - angle;
    petal.rotateX(-0.15); // 花びらを少し上向きに開く
    herb.add(petal);
  }
  // 花の中心
  const center = new THREE.Mesh(berryGeometry, toonMaterial(PALETTE.flowerCenter));
  center.scale.setScalar(0.05);
  center.position.y = height + 0.01;
  herb.add(center);
  herb.scale.setScalar(0.8 + rand() * 0.5);
  return herb;
}

/** 光って見える不思議な薬草(強い発光は使わず、明るい色+弱い自己発光色) */
export function createGlowHerb(rand: Rand): THREE.Group {
  const herb = new THREE.Group();
  const height = 0.45 + rand() * 0.2;
  herb.add(createStem(height));
  addLeavesAround(herb, rand, 3, height * 0.5, 0.11, 0.18, PALETTE.leafDark);
  const berry = new THREE.Mesh(
    berryGeometry,
    toonMaterial(PALETTE.glowBerry, PALETTE.glowEmissive)
  );
  berry.scale.setScalar(0.09 + rand() * 0.03);
  berry.position.y = height + 0.06;
  herb.add(berry);
  herb.scale.setScalar(0.8 + rand() * 0.5);
  return herb;
}

/**
 * ローポリの木(葉の形は3種類からランダム)。
 * 幹は太め・短めで安定感を出し、葉は小さめの塊を重ねて
 * 重たい1枚の塊に見えないようにする
 */
export function createTree(rand: Rand): THREE.Group {
  const tree = new THREE.Group();
  const trunkHeight = 0.7 + rand() * 0.5;
  const trunkThickness = 1.1 + rand() * 0.5;

  const trunk = new THREE.Mesh(trunkGeometry, toonMaterial(PALETTE.trunk));
  trunk.scale.set(trunkThickness, trunkHeight, trunkThickness);
  trunk.position.y = trunkHeight / 2;
  tree.add(trunk);

  // 木の葉色は星のテーマで差し替わる(春=桜、秋=紅葉など)
  const foliageColor =
    THEME.foliage[Math.floor(rand() * THEME.foliage.length)]!;
  const subColor = THEME.foliage[Math.floor(rand() * THEME.foliage.length)]!;
  const foliageScale = 0.7 + rand() * 0.5;
  const kind = Math.floor(rand() * 3);
  if (kind === 0) {
    // 三角の針葉樹(すこし小ぶりに)
    const foliage = new THREE.Mesh(coneFoliageGeometry, toonMaterial(foliageColor));
    foliage.scale.setScalar(foliageScale);
    foliage.position.y = trunkHeight + foliageScale * 0.9;
    tree.add(foliage);
  } else if (kind === 1) {
    // 丸いこんもりした木:大きな球1つ + 小さな球2つで丸いシルエットにする
    const main = new THREE.Mesh(roundFoliageGeometry, toonMaterial(foliageColor));
    main.scale.set(foliageScale, foliageScale * 1.0, foliageScale);
    main.position.y = trunkHeight + foliageScale * 0.75;
    tree.add(main);
    for (let i = 0; i < 2; i++) {
      const puff = new THREE.Mesh(roundFoliageGeometry, toonMaterial(subColor));
      const puffScale = foliageScale * (0.45 + rand() * 0.15);
      const angle = rand() * Math.PI * 2;
      puff.scale.setScalar(puffScale);
      puff.position.set(
        Math.cos(angle) * foliageScale * 0.6,
        trunkHeight + foliageScale * (0.45 + rand() * 0.55),
        Math.sin(angle) * foliageScale * 0.6
      );
      tree.add(puff);
    }
  } else {
    // カクカクした多面体の木:主の塊 + 小さな塊1つ
    const main = new THREE.Mesh(chunkFoliageGeometry, toonMaterial(foliageColor));
    main.scale.set(foliageScale, foliageScale * 1.1, foliageScale);
    main.position.y = trunkHeight + foliageScale * 0.8;
    main.rotation.y = rand() * Math.PI;
    tree.add(main);
    const chunk = new THREE.Mesh(chunkFoliageGeometry, toonMaterial(subColor));
    const chunkScale = foliageScale * 0.5;
    const angle = rand() * Math.PI * 2;
    chunk.scale.setScalar(chunkScale);
    chunk.position.set(
      Math.cos(angle) * foliageScale * 0.55,
      trunkHeight + foliageScale * 0.5,
      Math.sin(angle) * foliageScale * 0.55
    );
    chunk.rotation.y = rand() * Math.PI;
    tree.add(chunk);
  }

  tree.scale.setScalar(0.85 + rand() * 0.5);
  return tree;
}

/** 丸い実がついた薬草。細い茎が数本まとまって生え、先端に小さな実 */
export function createBerryHerb(rand: Rand): THREE.Group {
  const herb = new THREE.Group();
  const berryColors = [PALETTE.glowBerry, PALETTE.flowerCenter, PALETTE.petal];
  const stalkCount = 3 + Math.floor(rand() * 2); // 3〜4本
  for (let i = 0; i < stalkCount; i++) {
    const angle = (i / stalkCount) * Math.PI * 2 + rand();
    // 根元を軸に少し傾けるピボット(株がふわっと開く)
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(angle) * 0.04, 0, Math.sin(angle) * 0.04);
    pivot.rotation.z = (rand() - 0.5) * 0.5;
    pivot.rotation.x = (rand() - 0.5) * 0.5;
    const height = 0.28 + rand() * 0.18;
    pivot.add(createStem(height));
    const berry = new THREE.Mesh(
      berryGeometry,
      toonMaterial(berryColors[Math.floor(rand() * berryColors.length)]!)
    );
    berry.scale.setScalar(0.045 + rand() * 0.02);
    berry.position.y = height + 0.02;
    pivot.add(berry);
    herb.add(pivot);
  }
  herb.scale.setScalar(0.8 + rand() * 0.5);
  return herb;
}

/** 小さな花(花びら4〜6枚。白と黄色の2系統で背丈も低め) */
export function createSmallFlower(rand: Rand): THREE.Group {
  const herb = new THREE.Group();
  const height = 0.22 + rand() * 0.15;
  herb.add(createStem(height));
  const isWhite = rand() < 0.5;
  const petalColor = isWhite ? PALETTE.petal : PALETTE.flowerCenter;
  const centerColor = isWhite ? PALETTE.flowerCenter : PALETTE.petal;
  const petalCount = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2;
    const petal = new THREE.Mesh(leafGeometry, toonMaterial(petalColor));
    petal.scale.set(0.04, 0.012, 0.08);
    petal.position.set(Math.cos(angle) * 0.055, height, Math.sin(angle) * 0.055);
    petal.rotation.y = Math.PI / 2 - angle;
    petal.rotateX(-0.2);
    herb.add(petal);
  }
  const center = new THREE.Mesh(berryGeometry, toonMaterial(centerColor));
  center.scale.setScalar(0.032);
  center.position.y = height + 0.008;
  herb.add(center);
  herb.scale.setScalar(0.8 + rand() * 0.5);
  return herb;
}

/** 地面近くに葉が放射状に開くロゼット薬草 */
export function createRosetteHerb(rand: Rand): THREE.Group {
  const herb = new THREE.Group();
  const leafCount = 6 + Math.floor(rand() * 3);
  for (let i = 0; i < leafCount; i++) {
    const angle = (i / leafCount) * Math.PI * 2 + rand() * 0.4;
    const leaf = new THREE.Mesh(
      leafGeometry,
      toonMaterial(rand() < 0.3 ? PALETTE.leafDark : PALETTE.leaf)
    );
    leaf.scale.set(0.06, 0.02, 0.15);
    leaf.position.set(Math.cos(angle) * 0.09, 0.045, Math.sin(angle) * 0.09);
    leaf.rotation.y = Math.PI / 2 - angle;
    leaf.rotateX(0.55 + rand() * 0.3); // 地面に寝かせ気味に開く
    herb.add(leaf);
  }
  // 中心の小さな芽
  const bud = new THREE.Mesh(berryGeometry, toonMaterial(PALETTE.glowBerry));
  bud.scale.set(0.035, 0.05, 0.035);
  bud.position.y = 0.06;
  herb.add(bud);
  herb.scale.setScalar(0.8 + rand() * 0.6);
  return herb;
}

/** 少し不思議なつぼみの薬草(淡い黄緑のしずく形。ほんのり自己発光) */
export function createBudHerb(rand: Rand): THREE.Group {
  const herb = new THREE.Group();
  const height = 0.28 + rand() * 0.15;
  herb.add(createStem(height));
  addLeavesAround(herb, rand, 2, height * 0.35, 0.08, 0.14, PALETTE.leafDark);
  // しずく形のつぼみ(球を縦に伸ばす)+ 先端の白い点
  const bud = new THREE.Mesh(
    berryGeometry,
    toonMaterial(PALETTE.glowBerry, PALETTE.glowEmissive)
  );
  bud.scale.set(0.055, 0.085, 0.055);
  bud.position.y = height + 0.07;
  herb.add(bud);
  const tip = new THREE.Mesh(berryGeometry, toonMaterial(PALETTE.petal));
  tip.scale.setScalar(0.02);
  tip.position.y = height + 0.165;
  herb.add(tip);
  herb.scale.setScalar(0.8 + rand() * 0.5);
  return herb;
}

/** 淡い色の小さなキノコの群れ(2〜3本セット。丸い傘で地面のアクセント) */
export function createPaleMushroomCluster(rand: Rand): THREE.Group {
  const group = new THREE.Group();
  const capColors = [PALETTE.petal, PALETTE.flowerCenter, PALETTE.glowBerry];
  const count = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < count; i++) {
    const mushroom = new THREE.Group();
    const stalkHeight = 0.09 + rand() * 0.07;
    const stalk = new THREE.Mesh(stemGeometry, toonMaterial(PALETTE.petal));
    stalk.scale.set(1.6, stalkHeight, 1.6);
    stalk.position.y = stalkHeight / 2;
    mushroom.add(stalk);
    const cap = new THREE.Mesh(
      roundFoliageGeometry,
      toonMaterial(capColors[Math.floor(rand() * capColors.length)]!)
    );
    cap.scale.set(0.085, 0.05, 0.085);
    cap.position.y = stalkHeight + 0.02;
    mushroom.add(cap);
    mushroom.position.set((rand() - 0.5) * 0.24, 0, (rand() - 0.5) * 0.24);
    group.add(mushroom);
  }
  group.scale.setScalar(0.8 + rand() * 0.5);
  return group;
}

/** ローポリの岩(不均一に潰して自然な形にする) */
export function createRock(rand: Rand): THREE.Group {
  const group = new THREE.Group();
  const rock = new THREE.Mesh(
    rand() < 0.5 ? rockGeometryA : rockGeometryB,
    toonMaterial(PALETTE.rock)
  );
  rock.scale.set(0.6 + rand() * 0.9, 0.4 + rand() * 0.5, 0.6 + rand() * 0.9);
  // 向きを崩してから少し沈めて置く(グループごと球面に立てる)
  rock.rotation.set(rand() * 0.5, rand() * Math.PI * 2, rand() * 0.5);
  rock.position.y = 0.12;
  group.add(rock);
  return group;
}

/** アクセントの小さなキノコ(赤か紫の傘) */
export function createMushroom(rand: Rand): THREE.Group {
  const mushroom = new THREE.Group();
  const stalkHeight = 0.14 + rand() * 0.08;
  const stalk = new THREE.Mesh(stemGeometry, toonMaterial(PALETTE.petal));
  stalk.scale.set(1.8, stalkHeight, 1.8);
  stalk.position.y = stalkHeight / 2;
  mushroom.add(stalk);
  const cap = new THREE.Mesh(
    capGeometry,
    toonMaterial(rand() < 0.5 ? PALETTE.accentRed : PALETTE.accentPurple)
  );
  cap.scale.set(0.14, 0.12, 0.14);
  cap.position.y = stalkHeight + 0.04;
  mushroom.add(cap);
  mushroom.scale.setScalar(0.8 + rand() * 0.6);
  return mushroom;
}

/** 木箱 */
export function createCrate(rand: Rand): THREE.Group {
  const group = new THREE.Group();
  const size = 0.4 + rand() * 0.2;
  const crate = new THREE.Mesh(boxGeometry, toonMaterial(PALETTE.wood));
  crate.scale.setScalar(size);
  crate.position.y = size / 2;
  crate.rotation.y = rand() * 0.8;
  group.add(crate);
  return group;
}

/** 薬草の入った植木鉢 */
export function createPottedHerb(rand: Rand): THREE.Group {
  const group = new THREE.Group();
  const pot = new THREE.Mesh(potGeometry, toonMaterial(PALETTE.pot));
  pot.position.y = 0.1;
  group.add(pot);
  const leaves = new THREE.Mesh(roundFoliageGeometry, toonMaterial(PALETTE.leaf));
  leaves.scale.set(0.11, 0.09, 0.11);
  leaves.position.y = 0.25;
  group.add(leaves);
  group.scale.setScalar(0.9 + rand() * 0.4);
  return group;
}

/** 切り株 */
export function createStump(rand: Rand): THREE.Group {
  const group = new THREE.Group();
  const stump = new THREE.Mesh(trunkGeometry, toonMaterial(PALETTE.trunk));
  stump.scale.set(1.6, 0.3, 1.6);
  stump.position.y = 0.15;
  stump.rotation.y = rand() * Math.PI;
  group.add(stump);
  return group;
}

/** 店先のランタン(柱の上に、ほんのり明るい灯り) */
export function createLantern(): THREE.Group {
  const lantern = new THREE.Group();
  const post = new THREE.Mesh(stemGeometry, toonMaterial(PALETTE.wood));
  post.scale.set(1.6, 0.9, 1.6);
  post.position.y = 0.45;
  lantern.add(post);
  const light = new THREE.Mesh(
    berryGeometry,
    toonMaterial(PALETTE.lantern, PALETTE.lanternEmissive)
  );
  light.scale.setScalar(0.1);
  lantern.add(light);
  light.position.y = 0.98;
  const cap = new THREE.Mesh(capGeometry, toonMaterial(PALETTE.roof));
  cap.scale.set(0.12, 0.08, 0.12);
  cap.position.y = 1.1;
  lantern.add(cap);
  return lantern;
}

/** 薬草を乾燥させる台(2本の柱に横棒、干した薬草の束) */
export function createDryingRack(rand: Rand): THREE.Group {
  const rack = new THREE.Group();
  const postMaterial = toonMaterial(PALETTE.wood);
  for (const x of [-0.4, 0.4]) {
    const post = new THREE.Mesh(stemGeometry, postMaterial);
    post.scale.set(1.5, 0.8, 1.5);
    post.position.set(x, 0.4, 0);
    rack.add(post);
  }
  const bar = new THREE.Mesh(stemGeometry, postMaterial);
  bar.scale.set(1.2, 0.9, 1.2);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 0.78;
  rack.add(bar);
  // 干してある薬草の束(逆さの円錐)
  for (let i = 0; i < 3; i++) {
    const bundle = new THREE.Mesh(capGeometry, toonMaterial(PALETTE.leafDark));
    bundle.scale.set(0.07, 0.22, 0.07);
    bundle.rotation.x = Math.PI; // 逆さに吊るす
    bundle.position.set(-0.25 + i * 0.25 + rand() * 0.05, 0.66, 0);
    rack.add(bundle);
  }
  return rack;
}

// --- v2追加の薬草5種(12種化) ---

/** 月しろ草:夜空色の茎に、白くほのかに光る三日月形の花 */
export function createTsukishiroHerb(rand: Rand): THREE.Group {
  const herb = new THREE.Group();
  const height = 0.3 + rand() * 0.12;
  herb.add(createStem(height));
  addLeavesAround(herb, rand, 2, height * 0.3, 0.08, 0.13, PALETTE.leafDark);
  const moon = new THREE.Mesh(berryGeometry, toonMaterial(PALETTE.petal, 0x6a6a55));
  moon.scale.set(0.09, 0.05, 0.05);
  moon.rotation.z = 0.6;
  moon.position.y = height + 0.08;
  herb.add(moon);
  herb.scale.setScalar(0.8 + rand() * 0.5);
  return herb;
}

/** あかね草:夕焼け色の葉が段になって重なる、あたたかい色の株 */
export function createAkaneHerb(rand: Rand): THREE.Group {
  const herb = new THREE.Group();
  const height = 0.22 + rand() * 0.1;
  herb.add(createStem(height));
  for (let tier = 0; tier < 3; tier++) {
    addLeavesAround(
      herb,
      rand,
      3,
      height * (0.35 + tier * 0.3),
      0.07 - tier * 0.015,
      0.12 - tier * 0.02,
      tier === 1 ? PALETTE.haori : PALETTE.accentRed
    );
  }
  herb.scale.setScalar(0.8 + rand() * 0.5);
  return herb;
}

/** すずふり草:弓なりの茎から、鈴のような白い花が下向きにさがる */
export function createSuzufuriHerb(rand: Rand): THREE.Group {
  const herb = new THREE.Group();
  const height = 0.3 + rand() * 0.12;
  herb.add(createStem(height));
  addLeavesAround(herb, rand, 2, height * 0.25, 0.09, 0.16, PALETTE.leaf);
  for (let i = 0; i < 3; i++) {
    const bell = new THREE.Mesh(capGeometry, toonMaterial(PALETTE.petal));
    bell.scale.set(0.045, 0.06, 0.045);
    bell.rotation.x = Math.PI; // 下向きの鈴
    bell.position.set(0.05 + i * 0.055, height + 0.05 - i * 0.045, 0);
    herb.add(bell);
  }
  herb.scale.setScalar(0.8 + rand() * 0.5);
  return herb;
}

/** むらさき茸:薬になるふしぎな紫のキノコ(ひと株で1〜2本) */
export function createMurasakiMushroom(rand: Rand): THREE.Group {
  const group = new THREE.Group();
  const count = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < count; i++) {
    const mushroom = new THREE.Group();
    const stalkHeight = 0.12 + rand() * 0.08;
    const stalk = new THREE.Mesh(stemGeometry, toonMaterial(PALETTE.petal));
    stalk.scale.set(1.8, stalkHeight, 1.8);
    stalk.position.y = stalkHeight / 2;
    mushroom.add(stalk);
    const cap = new THREE.Mesh(
      capGeometry,
      toonMaterial(PALETTE.accentPurple, 0x2a1a3a)
    );
    cap.scale.set(0.1, 0.09, 0.1);
    cap.position.y = stalkHeight + 0.035;
    mushroom.add(cap);
    mushroom.position.set((rand() - 0.5) * 0.14, 0, (rand() - 0.5) * 0.14);
    group.add(mushroom);
  }
  group.scale.setScalar(0.85 + rand() * 0.4);
  return group;
}

/** こがね穂:金色の実が穂になってゆれる、麦のような草 */
export function createKoganeHerb(rand: Rand): THREE.Group {
  const herb = new THREE.Group();
  const stalks = 3 + Math.floor(rand() * 2);
  for (let i = 0; i < stalks; i++) {
    const height = 0.3 + rand() * 0.14;
    const stalk = createStem(height);
    stalk.position.set((rand() - 0.5) * 0.1, 0, (rand() - 0.5) * 0.1);
    stalk.rotation.z = (rand() - 0.5) * 0.3;
    herb.add(stalk);
    for (let g = 0; g < 4; g++) {
      const grain = new THREE.Mesh(berryGeometry, toonMaterial(PALETTE.flowerCenter));
      grain.scale.set(0.025, 0.04, 0.025);
      grain.position.set(
        stalk.position.x + Math.sin(stalk.rotation.z) * height * 0.8,
        height * 0.78 + g * 0.045,
        stalk.position.z
      );
      herb.add(grain);
    }
  }
  herb.scale.setScalar(0.8 + rand() * 0.5);
  return herb;
}
