import * as THREE from 'three';
import {
  PALETTE,
  PLANET_RADIUS,
  toonMaterial,
  flatGeometry,
  getGradientMap,
} from './palette.ts';
import { addCollider } from './collision.ts';
import { placeOnPlanet } from './placement.ts';
import { createLantern, createPottedHerb, createDryingRack } from './flora.ts';

/**
 * 町づくりの部品:レンガの道・湖・丘・家(集落)。
 * すべてプリミティブとインスタンシングで作り、球面に沿わせる。
 */

type Rand = () => number;

/** from の方向から toward の方向へ、angle ラジアンだけ進んだ方向 */
export function moveToward(
  from: THREE.Vector3,
  toward: THREE.Vector3,
  angle: number
): THREE.Vector3 {
  const axis = new THREE.Vector3().crossVectors(from, toward);
  if (axis.lengthSq() < 1e-8) return from.clone().normalize();
  axis.normalize();
  return from.clone().normalize().applyAxisAngle(axis, angle);
}

// --- レンガの道 ---

const _tileDir = new THREE.Vector3();
const _tilePos = new THREE.Vector3();
const _tileTangent = new THREE.Vector3();
const _tileTarget = new THREE.Vector3();
const _tileQuat = new THREE.Quaternion();
const _tileJitter = new THREE.Quaternion();
const _tileScale = new THREE.Vector3();
const _tileMatrix = new THREE.Matrix4();
const _tileLook = new THREE.Matrix4();
const _arcAxis = new THREE.Vector3();
const _lateralAxis = new THREE.Vector3();

/**
 * 大円の弧に沿ってレンガタイルを2列(互い違い)に敷く。
 * タイル全体を InstancedMesh 1つで描くので、何百枚あっても1ドローコール。
 * 戻り値は道の通り道の方向のサンプル(草の間引きに使う)。
 */
export function addRoads(
  scene: THREE.Scene,
  rand: Rand,
  arcs: Array<[THREE.Vector3, THREE.Vector3]>
): THREE.Vector3[] {
  const tileGeometry = flatGeometry(new THREE.BoxGeometry(0.38, 0.05, 0.5));
  const material = new THREE.MeshToonMaterial({ gradientMap: getGradientMap() });
  // タイル数を先に数える(3列 × 弧の長さ / 間隔)
  const stepAngle = 0.52 / PLANET_RADIUS;
  let capacity = 0;
  for (const [from, to] of arcs) {
    capacity += (Math.floor(from.angleTo(to) / stepAngle) + 1) * 3;
  }
  const mesh = new THREE.InstancedMesh(tileGeometry, material, capacity);

  const brickColors = [
    new THREE.Color(PALETTE.brick),
    new THREE.Color(PALETTE.brickLight),
    new THREE.Color(PALETTE.brickDark),
  ];
  const color = new THREE.Color();
  const samples: THREE.Vector3[] = [];
  // 交差点(複数の弧の端点が集まる場所)でタイルが積み重ならないよう、
  // 敷いたタイルの位置を覚えておき、近すぎる場所には敷かない
  const placedPositions: THREE.Vector3[] = [];
  const MIN_TILE_DISTANCE_SQ = 0.3 * 0.3;
  let placed = 0;

  for (const [from, to] of arcs) {
    const arcAngle = from.angleTo(to);
    _arcAxis.crossVectors(from, to);
    if (_arcAxis.lengthSq() < 1e-8) continue;
    _arcAxis.normalize();

    // 3列に敷いて道幅を広くする(真ん中の列だけ半歩ずらして互い違いにする)
    for (let column = 0; column < 3; column++) {
      const lateral = ((column - 1) * 0.38) / PLANET_RADIUS;
      const startOffset = column === 1 ? stepAngle / 2 : 0;
      for (let i = 0; i * stepAngle + startOffset <= arcAngle; i++) {
        _tileDir.copy(from).applyAxisAngle(_arcAxis, i * stepAngle + startOffset);
        // 進行方向(接線)と、横へずらす回転軸
        _tileTangent.crossVectors(_arcAxis, _tileDir).normalize();
        _lateralAxis.copy(_tileTangent);
        _tileDir.applyAxisAngle(_lateralAxis, lateral).normalize();

        _tilePos.copy(_tileDir).multiplyScalar(PLANET_RADIUS + 0.01);
        // 既存タイルと重なる位置はスキップ(交差点の過密防止)
        let overlapping = false;
        for (const existing of placedPositions) {
          if (existing.distanceToSquared(_tilePos) < MIN_TILE_DISTANCE_SQ) {
            overlapping = true;
            break;
          }
        }
        if (overlapping) continue;
        placedPositions.push(_tilePos.clone());

        _tileLook.lookAt(_tilePos, _tileTarget.copy(_tilePos).add(_tileTangent), _tileDir);
        _tileQuat.setFromRotationMatrix(_tileLook);
        _tileJitter.setFromAxisAngle(_tileDir, (rand() - 0.5) * 0.14); // 手作業感
        _tileQuat.premultiply(_tileJitter);
        _tileScale.set(0.82 + rand() * 0.3, 1, 0.82 + rand() * 0.3);
        _tileMatrix.compose(_tilePos, _tileQuat, _tileScale);
        mesh.setMatrixAt(placed, _tileMatrix);

        color
          .copy(brickColors[Math.floor(rand() * brickColors.length)]!)
          .multiplyScalar(0.92 + rand() * 0.16);
        mesh.setColorAt(placed, color);
        placed++;

        // 真ん中の列の3枚に1枚を、草の間引き用のサンプルとして記録する
        if (column === 1 && i % 3 === 0) samples.push(_tileDir.clone());
      }
    }
  }

  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false; // 惑星全体に広がるため
  mesh.receiveShadow = true;
  mesh.userData.noCastShadow = true; // 薄いタイルの影はノイズになる
  scene.add(mesh);
  return samples;
}

// --- 湖 ---

const _yAxis = new THREE.Vector3(0, 1, 0);

/**
 * 球面のキャップ(帽子形)を2枚重ねて湖を作る。
 * 外側のキャップが砂の縁、内側が水面。プレイヤーは入れない。
 */
export function addLake(
  scene: THREE.Scene,
  direction: THREE.Vector3,
  surfaceRadius: number
): void {
  const angle = surfaceRadius / PLANET_RADIUS;

  const sand = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS + 0.02, 36, 8, 0, Math.PI * 2, 0, angle * 1.18),
    toonMaterial(PALETTE.sand)
  );
  sand.quaternion.setFromUnitVectors(_yAxis, direction);
  sand.userData.noCastShadow = true;
  sand.receiveShadow = true;
  scene.add(sand);

  const water = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS + 0.045, 36, 8, 0, Math.PI * 2, 0, angle),
    toonMaterial(PALETTE.water)
  );
  water.quaternion.setFromUnitVectors(_yAxis, direction);
  water.userData.noCastShadow = true;
  water.receiveShadow = true;
  scene.add(water);

  // 水の中へは歩いて入れない
  addCollider(direction, surfaceRadius + 0.2);
}

// --- 丘 ---

/**
 * 小高い丘。つぶした半球を表面に置く(登れない見た目の丘)。
 * 地形の高低差は球面移動の安定性を優先してあえて作らないため、
 * 丘はまわりを歩いて眺める景色として扱う。
 */
export function addHill(
  scene: THREE.Scene,
  direction: THREE.Vector3,
  surfaceRadius: number,
  height: number,
  color: number
): void {
  const hill = new THREE.Mesh(
    flatGeometry(new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2)),
    toonMaterial(color)
  );
  hill.scale.set(surfaceRadius, height, surfaceRadius);
  hill.position.copy(direction).multiplyScalar(PLANET_RADIUS - 0.1);
  hill.quaternion.setFromUnitVectors(_yAxis, direction);
  hill.receiveShadow = true;
  scene.add(hill);
  addCollider(direction, surfaceRadius * 0.85);
}

// --- 家と集落 ---

const houseBodyGeometry = flatGeometry(new THREE.BoxGeometry(1.6, 1.2, 1.4));
const houseRoofGeometry = flatGeometry(new THREE.ConeGeometry(1.4, 0.9, 4));
const houseDoorGeometry = flatGeometry(new THREE.BoxGeometry(0.45, 0.75, 0.06));
const houseWindowGeometry = flatGeometry(new THREE.BoxGeometry(0.34, 0.34, 0.05));
const houseChimneyGeometry = flatGeometry(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 6));

const WALL_COLORS = [PALETTE.wall, PALETTE.petal, PALETTE.butterflyWing];
const ROOF_COLORS = [PALETTE.roof, PALETTE.accentRed, PALETTE.leafDark];

/** 積み木の家(薬屋より小さな民家)。原点が足元、-Z が正面 */
export function createHouse(rand: Rand): THREE.Group {
  const house = new THREE.Group();
  const wall = toonMaterial(WALL_COLORS[Math.floor(rand() * WALL_COLORS.length)]!);
  const roof = toonMaterial(ROOF_COLORS[Math.floor(rand() * ROOF_COLORS.length)]!);

  const body = new THREE.Mesh(houseBodyGeometry, wall);
  body.position.y = 0.6;
  house.add(body);

  const roofMesh = new THREE.Mesh(houseRoofGeometry, roof);
  roofMesh.position.y = 1.2 + 0.42;
  roofMesh.rotation.y = Math.PI / 4;
  house.add(roofMesh);

  const door = new THREE.Mesh(houseDoorGeometry, toonMaterial(PALETTE.door));
  door.position.set(0.15, 0.38, -0.71);
  house.add(door);

  const windowMaterial = toonMaterial(PALETTE.windowGlow, PALETTE.windowEmissive);
  const win = new THREE.Mesh(houseWindowGeometry, windowMaterial);
  win.position.set(-0.42, 0.68, -0.71);
  house.add(win);
  if (rand() < 0.6) {
    const sideWindow = new THREE.Mesh(houseWindowGeometry, windowMaterial);
    sideWindow.rotation.y = Math.PI / 2;
    sideWindow.position.set(0.81, 0.68, 0.2);
    house.add(sideWindow);
  }
  if (rand() < 0.4) {
    const chimney = new THREE.Mesh(houseChimneyGeometry, toonMaterial(PALETTE.rock));
    chimney.position.set(-0.45, 1.75, 0.3);
    house.add(chimney);
  }

  house.scale.setScalar(0.85 + rand() * 0.35);
  return house;
}

const _align = new THREE.Quaternion();
const _baseForward = new THREE.Vector3();
const _toCenter = new THREE.Vector3();
const _cross = new THREE.Vector3();

/** direction に立つオブジェクトの -Z を faceTarget へ向けるための yaw を求める */
export function yawTowards(direction: THREE.Vector3, faceTarget: THREE.Vector3): number {
  _align.setFromUnitVectors(_yAxis, direction);
  _baseForward.set(0, 0, -1).applyQuaternion(_align);
  _toCenter.copy(faceTarget).addScaledVector(direction, -faceTarget.dot(direction));
  if (_toCenter.lengthSq() < 1e-8) return 0;
  _toCenter.normalize();
  _cross.crossVectors(_baseForward, _toCenter);
  return Math.atan2(_cross.dot(direction), _baseForward.dot(_toCenter));
}

/** 接平面の基準ベクトル2本を作る */
function tangentBasis(center: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const reference =
    Math.abs(center.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const tangentA = new THREE.Vector3().crossVectors(center, reference).normalize();
  const tangentB = new THREE.Vector3().crossVectors(center, tangentA).normalize();
  return [tangentA, tangentB];
}

/** 家を1軒置く(ドアは faceTarget の方向を向く)。当たり判定つき */
export function placeHouse(
  scene: THREE.Scene,
  rand: Rand,
  direction: THREE.Vector3,
  faceTarget: THREE.Vector3
): void {
  const house = createHouse(rand);
  placeOnPlanet(house, direction, { sink: 0.1, yaw: yawTowards(direction, faceTarget) });
  scene.add(house);
  addCollider(direction, 1.35 * house.scale.x);
}

/**
 * 集落:中心の広場を囲むように家を数軒並べる。
 * 家と家の間に家2軒ぶんの隙間ができる半径にする。
 * isBlocked(道の上かどうか等)に当たった場合は、角度をずらして置き直す。
 */
export function addVillage(
  scene: THREE.Scene,
  rand: Rand,
  center: THREE.Vector3,
  houseCount: number,
  isBlocked?: (direction: THREE.Vector3) => boolean
): void {
  const [tangentA, tangentB] = tangentBasis(center);
  for (let i = 0; i < houseCount; i++) {
    for (let attempt = 0; attempt < 10; attempt++) {
      // 置けない場所(道の上など)なら、リングに沿って角度をずらして再挑戦
      const angle = (i / houseCount) * Math.PI * 2 + rand() * 0.25 + attempt * 0.35;
      const distance = houseCount * 0.031 + rand() * 0.015;
      const direction = center
        .clone()
        .addScaledVector(tangentA, Math.cos(angle) * distance)
        .addScaledVector(tangentB, Math.sin(angle) * distance)
        .normalize();
      if (isBlocked && isBlocked(direction)) continue;
      placeHouse(scene, rand, direction, center);
      break;
    }
  }
}

// --- 柵つきの牧場 ---

const fencePostGeometry = flatGeometry(new THREE.CylinderGeometry(0.045, 0.055, 0.42, 5));
const fenceRailGeometry = flatGeometry(new THREE.BoxGeometry(0.05, 0.05, 1));

const _postPosA = new THREE.Vector3();
const _postPosB = new THREE.Vector3();
const _railMid = new THREE.Vector3();

/**
 * 木の柵で囲った牧場。柵は柱+横木2段で、1スパンだけ開けて出入り口にする。
 * 柵に沿って当たり判定を並べ、プレイヤーがすり抜けないようにする。
 * 中の家畜(ひつじ)は animals.ts 側で追加する。
 */
export function addPasture(
  scene: THREE.Scene,
  center: THREE.Vector3,
  surfaceRadius: number
): void {
  const wood = toonMaterial(PALETTE.wood);
  const angleRadius = surfaceRadius / PLANET_RADIUS;
  const [tangentA, tangentB] = tangentBasis(center);
  const postCount = 14;

  const postDirections: THREE.Vector3[] = [];
  for (let i = 0; i < postCount; i++) {
    const a = (i / postCount) * Math.PI * 2;
    postDirections.push(
      center
        .clone()
        .addScaledVector(tangentA, Math.cos(a) * angleRadius)
        .addScaledVector(tangentB, Math.sin(a) * angleRadius)
        .normalize()
    );
  }

  for (let i = 0; i < postCount; i++) {
    const direction = postDirections[i]!;
    // 柱
    const post = new THREE.Mesh(fencePostGeometry, wood);
    post.position.copy(direction).multiplyScalar(PLANET_RADIUS + 0.16);
    post.quaternion.setFromUnitVectors(_yAxis, direction);
    scene.add(post);
    addCollider(direction, 0.3);

    // 横木2段(スパン0は出入り口として開けておく)
    if (i === 0) continue;
    const next = postDirections[(i + 1) % postCount]!;
    for (const height of [0.13, 0.29]) {
      _postPosA.copy(direction).multiplyScalar(PLANET_RADIUS + height);
      _postPosB.copy(next).multiplyScalar(PLANET_RADIUS + height);
      const rail = new THREE.Mesh(fenceRailGeometry, wood);
      _railMid.addVectors(_postPosA, _postPosB).multiplyScalar(0.5);
      rail.position.copy(_railMid);
      rail.scale.z = _postPosA.distanceTo(_postPosB);
      rail.up.copy(_railMid).normalize();
      rail.lookAt(_postPosB);
      scene.add(rail);
    }
    // 柱と柱の中間にも当たり判定(すり抜け防止)
    const middle = direction.clone().add(next).normalize();
    addCollider(middle, 0.35);
  }
}

// --- 畑 ---

const sproutConeGeometry = flatGeometry(new THREE.ConeGeometry(0.09, 0.18, 5));
const sproutBushGeometry = flatGeometry(new THREE.SphereGeometry(0.09, 6, 5));

/**
 * 畑:土の丸いパッチに、作物の列を並べる。
 * 列ごとに「とんがりした苗」と「丸い株」を交互にして畑らしくする
 */
export function addFarmField(scene: THREE.Scene, rand: Rand, center: THREE.Vector3): void {
  const soil = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS + 0.015, 24, 6, 0, Math.PI * 2, 0, 1.9 / PLANET_RADIUS),
    toonMaterial(PALETTE.soil)
  );
  soil.quaternion.setFromUnitVectors(_yAxis, center);
  soil.userData.noCastShadow = true;
  soil.receiveShadow = true;
  scene.add(soil);

  const [tangentA, tangentB] = tangentBasis(center);
  const leafMaterial = toonMaterial(PALETTE.leaf);
  const darkLeafMaterial = toonMaterial(PALETTE.leafDark);
  for (let row = -1.5; row <= 1.5; row++) {
    for (let column = -2; column <= 2; column++) {
      const direction = center
        .clone()
        .addScaledVector(tangentA, row * 0.023)
        .addScaledVector(tangentB, column * 0.02 + (rand() - 0.5) * 0.004)
        .normalize();
      const isCone = (row + 1.5) % 2 === 0;
      const sprout = new THREE.Mesh(
        isCone ? sproutConeGeometry : sproutBushGeometry,
        isCone ? darkLeafMaterial : leafMaterial
      );
      sprout.position.copy(direction).multiplyScalar(PLANET_RADIUS + 0.08);
      sprout.quaternion.setFromUnitVectors(_yAxis, direction);
      const size = 0.8 + rand() * 0.4;
      sprout.scale.setScalar(size);
      scene.add(sprout);
    }
  }
}

// --- おえんちゃんの家 ---

/**
 * おえんちゃんの家(薬草屋)。みんなの家から少し離れた静かな場所に建てる。
 * 派手さではなく「緑の屋根・薬草の看板・乾燥台・鉢植え」で
 * ここが特別な場所(薬草屋)だと分かるようにする。
 */
export function addOenHouse(
  scene: THREE.Scene,
  rand: Rand,
  direction: THREE.Vector3,
  faceTarget: THREE.Vector3
): void {
  const house = new THREE.Group();
  const wall = toonMaterial(PALETTE.wall);
  const roof = toonMaterial(PALETTE.leaf); // 緑の屋根が薬草屋の目印

  const body = new THREE.Mesh(flatGeometry(new THREE.BoxGeometry(1.9, 1.35, 1.6)), wall);
  body.position.y = 0.67;
  house.add(body);
  const roofMesh = new THREE.Mesh(flatGeometry(new THREE.ConeGeometry(1.65, 1.0, 4)), roof);
  roofMesh.position.y = 1.35 + 0.46;
  roofMesh.rotation.y = Math.PI / 4;
  house.add(roofMesh);
  const door = new THREE.Mesh(
    flatGeometry(new THREE.BoxGeometry(0.5, 0.85, 0.06)),
    toonMaterial(PALETTE.door)
  );
  door.position.set(0.2, 0.43, -0.81);
  house.add(door);
  const windowMaterial = toonMaterial(PALETTE.windowGlow, PALETTE.windowEmissive);
  for (const x of [-0.5, 0.62]) {
    const win = new THREE.Mesh(
      flatGeometry(new THREE.BoxGeometry(0.38, 0.38, 0.05)),
      windowMaterial
    );
    win.position.set(x, 0.8, -0.81);
    house.add(win);
  }
  const chimney = new THREE.Mesh(
    flatGeometry(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 6)),
    toonMaterial(PALETTE.rock)
  );
  chimney.position.set(-0.5, 1.95, 0.35);
  house.add(chimney);
  // 看板(柱+板+薬草の緑い丸)
  const signPost = new THREE.Mesh(
    flatGeometry(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 5)),
    toonMaterial(PALETTE.wood)
  );
  signPost.position.set(-1.25, 0.5, -1.0);
  house.add(signPost);
  const signBoard = new THREE.Mesh(
    flatGeometry(new THREE.BoxGeometry(0.7, 0.42, 0.07)),
    toonMaterial(PALETTE.petal)
  );
  signBoard.position.set(-1.25, 1.05, -1.0);
  signBoard.rotation.y = 0.2;
  house.add(signBoard);
  const mark = new THREE.Mesh(
    flatGeometry(new THREE.SphereGeometry(0.085, 6, 5)),
    toonMaterial(PALETTE.leaf)
  );
  mark.scale.z = 0.4;
  mark.position.set(-1.25, 1.05, -1.05);
  house.add(mark);

  placeOnPlanet(house, direction, { sink: 0.1, yaw: yawTowards(direction, faceTarget) });
  scene.add(house);
  addCollider(direction, 1.7);

  // まわりの小物:ランタン・乾燥台・鉢植え(薬草屋の暮らしの気配)
  const [tangentA, tangentB] = tangentBasis(direction);
  const offset = (a: number, b: number) =>
    direction
      .clone()
      .addScaledVector(tangentA, a)
      .addScaledVector(tangentB, b)
      .normalize();

  const lantern = createLantern();
  const lanternDirection = offset(0.055, -0.065);
  placeOnPlanet(lantern, lanternDirection, {});
  scene.add(lantern);
  addCollider(lanternDirection, 0.15);

  const rack = createDryingRack(rand);
  const rackDirection = offset(-0.09, 0.03);
  placeOnPlanet(rack, rackDirection, { yaw: 1.1 });
  scene.add(rack);
  addCollider(rackDirection, 0.45);

  for (const [a, b] of [
    [0.075, 0.02],
    [0.09, -0.025],
  ]) {
    const pot = createPottedHerb(rand);
    const potDirection = offset(a!, b!);
    placeOnPlanet(pot, potDirection, {});
    scene.add(pot);
    addCollider(potDirection, 0.18);
  }
}
