import './style.css';
import * as THREE from 'three';
import { PALETTE, toonMaterial, flatGeometry } from '../../palette.ts';
import { PLANET_RADIUS, VILLAGE_CENTERS, LAKES } from '../../world.ts';
import { PLANET_HERBS } from '../../content/planets.ts';
import { currentPlanet } from '../planet-state.ts';
import { itemName } from '../../content/items.ts';
import type { Feature, FeatureContext } from '../feature.ts';
import { addInteractable } from '../interact/index.ts';
import { getItemCount, consumeItems, grantItem } from '../pouch/index.ts';
import { addStarlight, celebrate } from '../quests/index.ts';
import { loadFeatureData, saveFeatureData } from '../save.ts';
import { currentDay } from '../clock.ts';
import { yawTowards } from '../../town.ts';

/**
 * 村の掲示板と日替わりのお手伝い(F6の第2層)+井戸の水汲み(F18の一部)。
 * 掲示板にはゲーム内の日ごとに3件のお手伝いが貼り出される
 * (「まるば草を2株」「ひつじの毛を1つ」「湖の水を2つ」…)。
 * その場で納品でき、お礼に星あかり(ときどき ふしぎな種)がもらえる。
 * 手書きの依頼と合わせて、依頼が尽きない星になる。
 */

const VERSION = 1;
/** 1日に貼り出される件数 */
const DAILY_COUNT = 3;

interface Errand {
  item: string;
  count: number;
  starlight: number;
  seed: boolean;
  done: boolean;
}

interface BoardSave {
  day: number;
  errands: Errand[];
}

/** その日のお手伝いを作る(薬草・羊毛・水からランダムに) */
function rollErrands(): Errand[] {
  const herbs = PLANET_HERBS[currentPlanet()] ?? PLANET_HERBS[1]!;
  const pool = [...herbs, 'wool', 'wool', 'water', 'water'];
  const errands: Errand[] = [];
  const used = new Set<string>();
  while (errands.length < DAILY_COUNT) {
    const item = pool[Math.floor(Math.random() * pool.length)]!;
    if (used.has(item)) continue;
    used.add(item);
    const count = 1 + Math.floor(Math.random() * 3);
    errands.push({
      item,
      count,
      starlight: count >= 3 ? 2 : 1,
      seed: Math.random() < 0.3,
      done: false,
    });
  }
  return errands;
}

export const boardFeature: Feature = {
  id: 'board',
  setup(ctx: FeatureContext): void {
    // 星ごとに別のセーブにする(依頼の品はその星の薬草から選ぶため、
    // 同じ日のまま星を移動しても前の星の依頼が残らないように)
    const saveKey = `board-p${currentPlanet()}`;
    let state: BoardSave =
      loadFeatureData<BoardSave>(saveKey, VERSION) ?? { day: 0, errands: [] };
    if (!Array.isArray(state.errands)) state = { day: 0, errands: [] };
    const save = () => saveFeatureData(saveKey, VERSION, state);
    const rollIfNeeded = () => {
      if (state.day === currentDay() && state.errands.length > 0) return;
      state = { day: currentDay(), errands: rollErrands() };
      save();
    };
    rollIfNeeded();
    ctx.events.on('day-passed', rollIfNeeded);

    // --- 掲示板の立て看板(最初の村の広場のそば) ---
    const boardDirection = VILLAGE_CENTERS[0]!.clone()
      .add(new THREE.Vector3(0.05, 0.02, 0.06))
      .normalize();
    const stand = new THREE.Group();
    for (const side of [-0.55, 0.55]) {
      const post = new THREE.Mesh(
        flatGeometry(new THREE.BoxGeometry(0.14, 1.5, 0.14)),
        toonMaterial(PALETTE.trunk)
      );
      post.position.set(side, 0.75, 0);
      stand.add(post);
    }
    const panel3d = new THREE.Mesh(
      flatGeometry(new THREE.BoxGeometry(1.5, 0.95, 0.08)),
      toonMaterial(PALETTE.wood)
    );
    panel3d.position.y = 1.05;
    stand.add(panel3d);
    for (let i = 0; i < 3; i++) {
      const paper = new THREE.Mesh(
        flatGeometry(new THREE.BoxGeometry(0.3, 0.4, 0.03)),
        toonMaterial(PALETTE.petal)
      );
      paper.position.set(-0.45 + i * 0.45, 1.05, 0.06);
      paper.rotation.z = (i - 1) * 0.08;
      stand.add(paper);
    }
    stand.position.copy(boardDirection).multiplyScalar(PLANET_RADIUS);
    stand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), boardDirection);
    stand.rotateY(yawTowards(boardDirection, VILLAGE_CENTERS[0]!));
    ctx.scene.add(stand);

    // --- 井戸(村の広場と湖畔) ---
    const wellDirections = [
      VILLAGE_CENTERS[1]!.clone().add(new THREE.Vector3(0.06, -0.02, -0.05)).normalize(),
      LAKES[0]!.direction.clone().lerp(VILLAGE_CENTERS[0]!, 0.28).normalize(),
    ];
    for (const direction of wellDirections) {
      const well = new THREE.Group();
      const rim = new THREE.Mesh(
        flatGeometry(new THREE.CylinderGeometry(0.5, 0.55, 0.5, 10)),
        toonMaterial(PALETTE.rock)
      );
      rim.position.y = 0.25;
      well.add(rim);
      const waterTop = new THREE.Mesh(
        flatGeometry(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 10)),
        toonMaterial(PALETTE.water)
      );
      waterTop.position.y = 0.5;
      well.add(waterTop);
      for (const side of [-0.42, 0.42]) {
        const pillar = new THREE.Mesh(
          flatGeometry(new THREE.BoxGeometry(0.1, 1.1, 0.1)),
          toonMaterial(PALETTE.trunk)
        );
        pillar.position.set(side, 0.75, 0);
        well.add(pillar);
      }
      const roof = new THREE.Mesh(
        flatGeometry(new THREE.ConeGeometry(0.75, 0.45, 6)),
        toonMaterial(PALETTE.roof)
      );
      roof.position.y = 1.5;
      well.add(roof);
      well.position.copy(direction).multiplyScalar(PLANET_RADIUS);
      well.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      ctx.scene.add(well);

      addInteractable({
        direction,
        radius: 1.7,
        label: '水をくむ',
        priority: 4,
        onUse: () => {
          grantItem('water');
          ctx.events.emit('item-picked', { item: 'water' });
        },
      });
    }

    // --- 掲示板のパネル(紙調) ---
    const panel = document.createElement('div');
    panel.id = 'board-panel';
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
      title.className = 'board-title';
      title.textContent = `お手伝い掲示板 — ${currentDay()}日目`;
      panel.appendChild(title);
      const note = document.createElement('div');
      note.className = 'board-note';
      note.textContent = '村のみんなからの、小さなお願いごと。日がのぼると貼り替わる。';
      panel.appendChild(note);
      for (const errand of state.errands) {
        const row = document.createElement('div');
        row.className = errand.done ? 'board-row done' : 'board-row';
        const text = document.createElement('div');
        text.className = 'board-text';
        text.textContent = errand.done
          ? `✅ ${itemName(errand.item)} × ${errand.count} — ありがとう!`
          : `${itemName(errand.item)} × ${errand.count}(いま ${getItemCount(errand.item)})`;
        row.appendChild(text);
        if (!errand.done) {
          const deliver = document.createElement('button');
          deliver.className = 'board-deliver';
          deliver.textContent = 'とどける';
          deliver.disabled = getItemCount(errand.item) < errand.count;
          deliver.addEventListener('click', () => {
            if (!consumeItems([{ item: errand.item, count: errand.count }])) return;
            errand.done = true;
            addStarlight(errand.starlight);
            if (errand.seed) grantItem('seed_mix');
            celebrate(
              `おてつだいをとどけた! ✨星あかり +${errand.starlight}` +
                (errand.seed ? '・ふしぎな種' : '')
            );
            save();
            ctx.events.emit('quest-completed', { questId: `errand-${errand.item}` });
            refreshPanel();
          });
          row.appendChild(deliver);
        }
        panel.appendChild(row);
      }
    };

    addInteractable({
      direction: boardDirection,
      radius: 1.8,
      label: '掲示板を見る',
      priority: 6,
      onUse: () => {
        rollIfNeeded();
        refreshPanel();
        panel.classList.toggle('open');
      },
    });
    boardRuntime = { panel, direction: boardDirection };
  },
  update(_deltaTime: number, ctx: FeatureContext): void {
    // 掲示板から歩いて離れたらパネルを閉じる
    if (!boardRuntime?.panel.classList.contains('open')) return;
    _playerDir.copy(ctx.player.mesh.position).normalize();
    if (_playerDir.dot(boardRuntime.direction) < Math.cos(3.2 / PLANET_RADIUS)) {
      boardRuntime.panel.classList.remove('open');
    }
  },
};

let boardRuntime: { panel: HTMLDivElement; direction: THREE.Vector3 } | null = null;
const _playerDir = new THREE.Vector3();
