import * as THREE from 'three';
import { PALETTE, toonMaterial, flatGeometry } from './palette.ts';

/**
 * 小さな薬屋。プリミティブだけで組み立てる。
 * 原点が建物の足元、+Y が上、-Z が正面(ドア側)。
 */

const boxGeometry = flatGeometry(new THREE.BoxGeometry(1, 1, 1));
const roofGeometry = flatGeometry(new THREE.ConeGeometry(2.3, 1.3, 4));
const chimneyGeometry = flatGeometry(new THREE.CylinderGeometry(0.13, 0.16, 0.7, 6));
const signPostGeometry = flatGeometry(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 5));

export function createShop(): THREE.Group {
  const shop = new THREE.Group();

  // 建物本体
  const body = new THREE.Mesh(boxGeometry, toonMaterial(PALETTE.wall));
  body.scale.set(2.6, 1.8, 2.2);
  body.position.y = 0.9;
  shop.add(body);

  // 四角錐の屋根(4分割の円錐を45度回して箱に合わせる)
  const roof = new THREE.Mesh(roofGeometry, toonMaterial(PALETTE.roof));
  roof.position.y = 1.8 + 0.6;
  roof.rotation.y = Math.PI / 4;
  shop.add(roof);

  // ドア(正面 = -Z 側)
  const door = new THREE.Mesh(boxGeometry, toonMaterial(PALETTE.door));
  door.scale.set(0.7, 1.15, 0.08);
  door.position.set(0, 0.58, -1.12);
  shop.add(door);

  // 窓(灯りがともって見えるように、ほんのり自己発光させる)
  const windowMaterial = toonMaterial(PALETTE.windowGlow, PALETTE.windowEmissive);
  for (const x of [-0.85, 0.85]) {
    const win = new THREE.Mesh(boxGeometry, windowMaterial);
    win.scale.set(0.5, 0.5, 0.06);
    win.position.set(x, 1.05, -1.12);
    shop.add(win);
  }
  // 横の壁にも小さな窓をひとつ
  const sideWindow = new THREE.Mesh(boxGeometry, windowMaterial);
  sideWindow.scale.set(0.06, 0.45, 0.45);
  sideWindow.position.set(1.32, 1.05, 0.2);
  shop.add(sideWindow);

  // 煙突
  const chimney = new THREE.Mesh(chimneyGeometry, toonMaterial(PALETTE.rock));
  chimney.position.set(0.75, 2.55, 0.45);
  shop.add(chimney);

  // 看板(文字なし。柱+板)
  const signPost = new THREE.Mesh(signPostGeometry, toonMaterial(PALETTE.wood));
  signPost.position.set(-1.15, 0.55, -1.45);
  shop.add(signPost);
  const signBoard = new THREE.Mesh(boxGeometry, toonMaterial(PALETTE.petal));
  signBoard.scale.set(0.75, 0.45, 0.07);
  signBoard.position.set(-1.15, 1.15, -1.45);
  signBoard.rotation.y = 0.15;
  shop.add(signBoard);
  // 看板に薬草マークとして小さな緑の丸を付ける
  const mark = new THREE.Mesh(
    flatGeometry(new THREE.SphereGeometry(0.09, 6, 5)),
    toonMaterial(PALETTE.leaf)
  );
  mark.scale.z = 0.4;
  mark.position.set(-1.15, 1.15, -1.5);
  shop.add(mark);

  // 店の前の薬草棚(箱の上に鉢を並べる)
  const shelf = new THREE.Mesh(boxGeometry, toonMaterial(PALETTE.wood));
  shelf.scale.set(1.1, 0.45, 0.4);
  shelf.position.set(1.0, 0.23, -1.35);
  shop.add(shelf);
  const potGeometry = flatGeometry(new THREE.CylinderGeometry(0.11, 0.09, 0.16, 7));
  const potMaterial = toonMaterial(PALETTE.pot);
  const herbGeometry = flatGeometry(new THREE.SphereGeometry(1, 6, 5));
  const herbColors = [PALETTE.leaf, PALETTE.glowBerry, PALETTE.accentPurple];
  for (let i = 0; i < 3; i++) {
    const pot = new THREE.Mesh(potGeometry, potMaterial);
    pot.position.set(0.65 + i * 0.35, 0.53, -1.35);
    shop.add(pot);
    const herb = new THREE.Mesh(herbGeometry, toonMaterial(herbColors[i]!));
    herb.scale.set(0.09, 0.08, 0.09);
    herb.position.set(0.65 + i * 0.35, 0.66, -1.35);
    shop.add(herb);
  }

  return shop;
}
