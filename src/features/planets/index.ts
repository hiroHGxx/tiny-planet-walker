import './style.css';
import * as THREE from 'three';
import { PALETTE, toonMaterial, flatGeometry } from '../../palette.ts';
import { PLANET_RADIUS } from '../../world.ts';
import { addCollider } from '../../collision.ts';
import type { Feature, FeatureContext } from '../feature.ts';
import { addInteractable } from '../interact/index.ts';
import { starlightCount } from '../quests/index.ts';
import { currentPlanet, setPlanet } from '../planet-state.ts';

/**
 * 次の星へ(F20)。
 * 依頼やお手伝いで貯めた「星あかり」が規定数たまると、
 * 気球の発着台から別の星へ旅立てる(星のたね違いで木・岩・薬草・住人が変わる)。
 * 星の切り替えはページ再読み込みで行う(世界一式を作り直す最も安全な方法)。
 * 元の星にはいつでも帰れる。
 */

/**
 * 星ごとの名前と、行くのに必要な星あかり。
 * ※現在はデバッグ用に低め(5/10)。本来の値は 30/60 に戻す予定
 */
const PLANETS: ReadonlyArray<{ name: string; need: number }> = [
  { name: '薬草の星', need: 0 },
  { name: 'こもれびの星', need: 5 },
  { name: 'しんじゅの星', need: 10 },
];

/** 発着台の場所(開始地点から少し歩いた丘のふもと) */
const PAD_DIRECTION = new THREE.Vector3(0.42, 0.88, -0.16).normalize();

export const planetsFeature: Feature = {
  id: 'planets',
  setup(ctx: FeatureContext): void {
    // --- 気球の発着台 ---
    const pad = new THREE.Group();
    const deck = new THREE.Mesh(
      flatGeometry(new THREE.CylinderGeometry(1.3, 1.45, 0.3, 10)),
      toonMaterial(PALETTE.wood)
    );
    deck.position.y = 0.15;
    pad.add(deck);
    const basket = new THREE.Mesh(
      flatGeometry(new THREE.BoxGeometry(0.9, 0.7, 0.9)),
      toonMaterial(PALETTE.pot)
    );
    basket.position.y = 0.65;
    pad.add(basket);
    const balloon = new THREE.Mesh(
      flatGeometry(new THREE.SphereGeometry(1.15, 10, 8)),
      toonMaterial(PALETTE.accentRed)
    );
    balloon.scale.y = 1.15;
    balloon.position.y = 3.1;
    pad.add(balloon);
    const stripe = new THREE.Mesh(
      flatGeometry(new THREE.SphereGeometry(1.16, 10, 8)),
      toonMaterial(PALETTE.petal)
    );
    stripe.scale.set(1, 0.35, 1);
    stripe.position.y = 3.1;
    pad.add(stripe);
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const rope = new THREE.Mesh(
        flatGeometry(new THREE.CylinderGeometry(0.02, 0.02, 1.35, 4)),
        toonMaterial(PALETTE.outline)
      );
      rope.position.set(Math.cos(angle) * 0.48, 1.65, Math.sin(angle) * 0.48);
      pad.add(rope);
    }
    pad.position.copy(PAD_DIRECTION).multiplyScalar(PLANET_RADIUS);
    pad.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), PAD_DIRECTION);
    ctx.scene.add(pad);
    addCollider(PAD_DIRECTION, 1.0);

    // --- 行き先のパネル ---
    const panel = document.createElement('div');
    panel.id = 'planets-panel';
    document.body.appendChild(panel);
    const closePanel = () => panel.classList.remove('open');
    window.addEventListener('pointerdown', (event) => {
      if (!panel.classList.contains('open')) return;
      const target = event.target;
      if (target instanceof Node && panel.contains(target)) return;
      closePanel();
    });

    const refreshPanel = () => {
      panel.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'planets-title';
      title.textContent = '気球 — 行き先をえらぶ';
      const starlight = document.createElement('div');
      starlight.className = 'planets-starlight';
      starlight.textContent = `いまの星あかり:✨ ${starlightCount()}`;
      panel.append(title, starlight);

      PLANETS.forEach((planet, index) => {
        const number = index + 1;
        const row = document.createElement('div');
        row.className = 'planets-row';
        const name = document.createElement('div');
        name.className = 'planets-name';
        name.textContent = `${planet.name}`;
        row.appendChild(name);
        if (number === currentPlanet()) {
          const here = document.createElement('div');
          here.className = 'planets-here';
          here.textContent = 'いまここ';
          row.appendChild(here);
        } else if (starlightCount() >= planet.need) {
          const go = document.createElement('button');
          go.className = 'planets-go';
          go.textContent = '旅立つ';
          go.addEventListener('click', () => {
            setPlanet(number);
            // 暗転してから世界を作り直す
            const fade = document.querySelector('#scene-fade');
            fade?.classList.add('dark');
            window.setTimeout(() => location.reload(), 420);
          });
          row.appendChild(go);
        } else {
          const locked = document.createElement('div');
          locked.className = 'planets-locked';
          locked.textContent = `✨${planet.need}で行ける`;
          row.appendChild(locked);
        }
        panel.appendChild(row);
      });
    };

    addInteractable({
      direction: PAD_DIRECTION,
      radius: 2.2,
      label: '気球に乗る',
      priority: 9,
      onUse: () => {
        refreshPanel();
        panel.classList.toggle('open');
      },
    });
    planetsPanel = panel;
  },
  update(_deltaTime: number, ctx: FeatureContext): void {
    // 発着台から歩いて離れたらパネルを閉じる
    if (!planetsPanel?.classList.contains('open')) return;
    _playerDir.copy(ctx.player.mesh.position).normalize();
    if (_playerDir.dot(PAD_DIRECTION) < Math.cos(3.6 / PLANET_RADIUS)) {
      planetsPanel.classList.remove('open');
    }
  },
};

let planetsPanel: HTMLDivElement | null = null;
const _playerDir = new THREE.Vector3();
