import './style.css';
import * as THREE from 'three';
import { PALETTE, toonMaterial, flatGeometry } from '../../palette.ts';
import { OEN_HOME, OEN_JUNCTION } from '../../world.ts';
import { moveToward } from '../../town.ts';
import { RECIPES, canCraft } from '../../content/recipes.ts';
import { itemIcon, itemName } from '../../content/items.ts';
import type { Feature, FeatureContext } from '../feature.ts';
import { addInteractable } from '../interact/index.ts';
import { getItemCount, grantItem, consumeItems } from '../pouch/index.ts';
import { starlightCount } from '../quests/index.ts';

/**
 * おえんちゃんの家の中(F7)。
 * 家のドアで「E 入る」と、暗転をはさんで3Dの室内シーンへ切り替わる。
 * 室内は外観より少し広い一間(絵本のドールハウス風)で、
 * 調合台に近づくと「E 調合」でレシピ帳が開き、薬草から薬を作れる。
 * 部屋・家具はすべてプリミティブのコード生成。
 */

/** 部屋の広さ(x: -5〜5, z: -4〜4)と、歩ける範囲 */
const BOUNDS = { minX: -4.4, maxX: 4.4, minZ: -3.3, maxZ: 3.4 };

// 使い回し用の一時オブジェクト
const _camForward = new THREE.Vector3();

/** 室内シーンを組み立てる(すべてプリミティブ) */
function buildInterior(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x241a2e); // 輪郭線と同じ濃紫(壁の外)

  const add = (mesh: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh => {
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  };
  const box = (
    w: number,
    h: number,
    d: number,
    color: number,
    emissive = 0
  ): THREE.Mesh =>
    new THREE.Mesh(
      flatGeometry(new THREE.BoxGeometry(w, h, d)),
      toonMaterial(color, emissive)
    );

  // 床・ラグ・壁
  add(box(10.8, 0.3, 8.8, PALETTE.wood), 0, -0.15, 0);
  const rug = new THREE.Mesh(
    flatGeometry(new THREE.CylinderGeometry(1.35, 1.35, 0.04, 24)),
    toonMaterial(PALETTE.pot)
  );
  add(rug, 0, 0.02, 0.6);
  add(box(10.8, 3.4, 0.3, PALETTE.wall), 0, 1.7, -4.55); // 奥の壁
  add(box(0.3, 3.4, 8.8, PALETTE.wall), -5.55, 1.7, 0); // 左の壁
  add(box(0.3, 3.4, 8.8, PALETTE.wall), 5.55, 1.7, 0); // 右の壁

  // 窓(奥の壁。外の灯りがともっているように見せる)
  add(box(1.6, 1.6, 0.14, PALETTE.trunk), 1.9, 1.8, -4.38);
  add(box(1.25, 1.25, 0.1, PALETTE.windowGlow, PALETTE.windowEmissive), 1.9, 1.8, -4.34);
  add(box(0.08, 1.25, 0.12, PALETTE.trunk), 1.9, 1.8, -4.3); // 桟(縦)
  add(box(1.25, 0.08, 0.12, PALETTE.trunk), 1.9, 1.8, -4.3); // 桟(横)

  // 調合台(テーブル+大鍋+すり鉢+薬瓶)
  const craft = new THREE.Group();
  craft.position.set(-2.7, 0, -2.4);
  const tableTop = box(2.7, 0.16, 1.4, PALETTE.wood);
  tableTop.position.y = 0.96;
  craft.add(tableTop);
  for (const [lx, lz] of [[-1.2, -0.55], [1.2, -0.55], [-1.2, 0.55], [1.2, 0.55]]) {
    const leg = box(0.16, 0.96, 0.16, PALETTE.trunk);
    leg.position.set(lx!, 0.48, lz!);
    craft.add(leg);
  }
  const pot = new THREE.Mesh(
    flatGeometry(new THREE.SphereGeometry(0.42, 9, 7)),
    toonMaterial(PALETTE.rock)
  );
  pot.scale.y = 0.78;
  pot.position.set(-0.7, 1.32, 0);
  craft.add(pot);
  const potRim = new THREE.Mesh(
    flatGeometry(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 12)),
    toonMaterial(PALETTE.glowBerry, PALETTE.glowEmissive)
  );
  potRim.position.set(-0.7, 1.62, 0);
  craft.add(potRim);
  const mortar = new THREE.Mesh(
    flatGeometry(new THREE.SphereGeometry(0.2, 8, 6)),
    toonMaterial(PALETTE.petal)
  );
  mortar.scale.y = 0.6;
  mortar.position.set(0.35, 1.14, 0.25);
  craft.add(mortar);
  const bottleColors = [PALETTE.glowBerry, PALETTE.accentPurple, PALETTE.flowerCenter];
  bottleColors.forEach((color, i) => {
    const bottle = new THREE.Mesh(
      flatGeometry(new THREE.CylinderGeometry(0.09, 0.11, 0.3, 8)),
      toonMaterial(color)
    );
    bottle.position.set(0.75 + i * 0.28, 1.2, -0.35);
    craft.add(bottle);
  });
  scene.add(craft);

  // 薬棚(奥の壁の左側。棚板2段+びん)
  for (const [shelfY, jarCount] of [[1.5, 4], [2.1, 3]] as const) {
    const shelf = box(2.5, 0.1, 0.55, PALETTE.wood);
    shelf.position.set(-2.7, shelfY, -4.1);
    scene.add(shelf);
    for (let i = 0; i < jarCount; i++) {
      const jar = new THREE.Mesh(
        flatGeometry(new THREE.CylinderGeometry(0.13, 0.15, 0.34, 8)),
        toonMaterial(
          [PALETTE.glowBerry, PALETTE.flowerCenter, PALETTE.accentPurple, PALETTE.leaf][
            i % 4
          ]!
        )
      );
      jar.position.set(-3.6 + i * 0.6, shelfY + 0.22, -4.1);
      scene.add(jar);
    }
  }

  // 寝床(木のベッド+緑のふとん+まくら)
  const bed = new THREE.Group();
  bed.position.set(3.4, 0, -2.7);
  const bedBase = box(1.7, 0.42, 2.8, PALETTE.trunk);
  bedBase.position.y = 0.21;
  bed.add(bedBase);
  const futon = box(1.55, 0.2, 2.5, PALETTE.kimono);
  futon.position.y = 0.52;
  bed.add(futon);
  const pillow = box(0.55, 0.16, 0.4, PALETTE.petal);
  pillow.position.set(0, 0.62, -0.95);
  bed.add(pillow);
  scene.add(bed);

  // ポスト(F19「るすばんの星」の受け取り場所。いまは置物)
  const post = new THREE.Group();
  post.position.set(1.6, 0, 3.7);
  const postBody = box(0.5, 0.42, 0.34, PALETTE.accentRed);
  postBody.position.y = 0.72;
  post.add(postBody);
  const postLeg = box(0.1, 0.55, 0.1, PALETTE.trunk);
  postLeg.position.y = 0.27;
  post.add(postLeg);
  const slit = box(0.3, 0.04, 0.05, PALETTE.outline);
  slit.position.set(0, 0.78, 0.17);
  post.add(slit);
  scene.add(post);

  // ランタン(天井から下がる灯り)と照明
  const cord = box(0.04, 0.5, 0.04, PALETTE.outline);
  cord.position.set(0, 3.05, 0);
  scene.add(cord);
  const lantern = new THREE.Mesh(
    flatGeometry(new THREE.SphereGeometry(0.16, 8, 6)),
    toonMaterial(PALETTE.lantern, 0x6a4a20)
  );
  lantern.position.set(0, 2.7, 0);
  scene.add(lantern);
  scene.add(new THREE.HemisphereLight(0xfff2dc, 0x6a5a44, 0.85));
  const warm = new THREE.PointLight(0xffc86e, 9, 16, 1.6);
  warm.position.set(0, 2.5, 0.5);
  scene.add(warm);

  return scene;
}

export const homeFeature: Feature = {
  id: 'home',
  setup(ctx: FeatureContext): void {
    const interior = buildInterior();
    const camera = new THREE.PerspectiveCamera(
      42,
      window.innerWidth / window.innerHeight,
      0.1,
      60
    );
    camera.position.set(0, 4.8, 7.4);
    camera.lookAt(0, 0.8, -0.6);
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    });

    // 暗転用のオーバーレイ
    const fade = document.createElement('div');
    fade.id = 'scene-fade';
    document.body.appendChild(fade);
    let switching = false;

    const savedPosition = new THREE.Vector3();
    const savedQuaternion = new THREE.Quaternion();

    /** 暗転をはさんで場面を切り替える */
    const transition = (apply: () => void) => {
      if (switching) return;
      switching = true;
      fade.classList.add('dark');
      window.setTimeout(() => {
        apply();
        fade.classList.remove('dark');
        switching = false;
      }, 380);
    };

    const enter = () =>
      transition(() => {
        savedPosition.copy(ctx.player.mesh.position);
        savedQuaternion.copy(ctx.player.mesh.quaternion);
        interior.add(ctx.player.mesh); // 星のシーンからは自動で外れる
        ctx.player.mesh.position.set(0, 0, 2.9);
        ctx.player.mesh.quaternion.identity(); // 部屋の奥(-Z)を向く
        ctx.director.mode = 'interior';
        ctx.setView(interior, camera);
        ctx.events.emit('scene-changed', { scene: 'interior' });
      });

    const exit = () =>
      transition(() => {
        closeCraftPanel();
        ctx.scene.add(ctx.player.mesh);
        ctx.player.mesh.position.copy(savedPosition);
        ctx.player.mesh.quaternion.copy(savedQuaternion);
        ctx.director.mode = 'planet';
        ctx.setView(ctx.scene, ctx.camera);
        ctx.events.emit('scene-changed', { scene: 'planet' });
      });

    // 家のドア(星side)と、部屋のドア(室内side)
    // ドアの判定は家の当たり判定(半径1.9)の外からでも届くよう、
    // 小道側へ1.5ユニット出した位置に広め(2.2)で置く
    addInteractable({
      direction: moveToward(OEN_HOME.clone(), OEN_JUNCTION, 0.06),
      radius: 2.2,
      label: '家に入る',
      priority: 8,
      onUse: enter,
    });
    addInteractable({
      direction: new THREE.Vector3(0, 1, 0), // 室内では未使用(positionで判定)
      position: new THREE.Vector3(0, 0, 3.6),
      space: 'interior',
      radius: 1.4,
      label: '外に出る',
      priority: 8,
      onUse: exit,
    });

    // --- 星あかりのランタン瓶(貯まるほど光の粒が増える) ---
    const jar = new THREE.Mesh(
      flatGeometry(new THREE.CylinderGeometry(0.26, 0.3, 0.55, 8)),
      new THREE.MeshToonMaterial({
        color: 0xdfe7ff,
        transparent: true,
        opacity: 0.35,
      })
    );
    jar.position.set(4.6, 0.28, -0.6);
    interior.add(jar);
    let starPoints: THREE.Points | null = null;
    const refreshJar = () => {
      if (starPoints) {
        interior.remove(starPoints);
        starPoints.geometry.dispose();
      }
      const count = Math.min(starlightCount(), 60);
      if (count === 0) return;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 0.2;
        positions[i * 3] = 4.6 + Math.cos(angle) * radius;
        positions[i * 3 + 1] = 0.08 + Math.random() * 0.42;
        positions[i * 3 + 2] = -0.6 + Math.sin(angle) * radius;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      starPoints = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: 0xffe9a8,
          size: 0.05,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
        })
      );
      interior.add(starPoints);
    };
    refreshJar();
    ctx.events.on('starlight-changed', refreshJar);

    // --- 調合台とレシピ帳 ---
    const panel = document.createElement('div');
    panel.id = 'craft-panel';
    document.body.appendChild(panel);

    const closeCraftPanel = () => panel.classList.remove('open');

    const refreshPanel = () => {
      panel.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'craft-title';
      title.textContent = '調合台 — レシピ帳';
      const close = document.createElement('button');
      close.className = 'craft-close';
      close.textContent = '✕';
      close.addEventListener('click', closeCraftPanel);
      panel.append(close, title);

      for (const recipe of RECIPES) {
        const row = document.createElement('div');
        row.className = 'craft-row';
        const icon = document.createElement('div');
        icon.className = 'craft-icon';
        icon.innerHTML = itemIcon(recipe.result);
        const info = document.createElement('div');
        info.className = 'craft-info';
        const name = document.createElement('div');
        name.className = 'craft-name';
        name.textContent = itemName(recipe.result);
        const needs = document.createElement('div');
        needs.className = 'craft-needs';
        needs.innerHTML = recipe.needs
          .map((need) => {
            const enough = getItemCount(need.item) >= need.count;
            return `<span class="${enough ? 'ok' : 'lack'}">${itemName(need.item)} ${getItemCount(need.item)}/${need.count}</span>`;
          })
          .join('・');
        const note = document.createElement('div');
        note.className = 'craft-note';
        note.textContent = recipe.note;
        info.append(name, needs, note);
        const make = document.createElement('button');
        make.className = 'craft-make';
        make.textContent = 'つくる';
        make.disabled = !canCraft(recipe, getItemCount);
        make.addEventListener('click', () => {
          if (!consumeItems(recipe.needs)) return;
          grantItem(recipe.result);
          ctx.events.emit('craft-done', { recipeId: recipe.id });
          refreshPanel();
        });
        row.append(icon, info, make);
        panel.appendChild(row);
      }
    };

    addInteractable({
      direction: new THREE.Vector3(0, 1, 0),
      position: new THREE.Vector3(-2.7, 0, -1.6), // 調合台の手前
      space: 'interior',
      radius: 1.7,
      label: '調合する',
      priority: 5,
      onUse: () => {
        if (panel.classList.contains('open')) {
          closeCraftPanel();
        } else {
          refreshPanel();
          panel.classList.add('open');
        }
      },
    });

    window.addEventListener('pointerdown', (event) => {
      if (!panel.classList.contains('open')) return;
      const target = event.target;
      if (target instanceof Node && panel.contains(target)) return;
      closeCraftPanel();
    });
  },
  update(deltaTime: number, ctx: FeatureContext): void {
    if (ctx.director.mode !== 'interior') return;
    // 室内は平面移動。カメラが固定なので「画面の奥」= 部屋の奥(-Z)
    _camForward.set(0, -0.45, -1).normalize();
    ctx.player.updateInRoom(deltaTime, ctx.input(), _camForward, BOUNDS);
  },
};
