import './style.css';
import type * as THREE from 'three';
import { ITEMS, itemIcon, itemName } from '../../content/items.ts';
import type { Feature, FeatureContext } from '../feature.ts';
import { addInteractable } from '../interact/index.ts';
import { loadFeatureData, saveFeatureData } from '../save.ts';
import { currentDay } from '../clock.ts';
import type { EventBus } from '../events.ts';

/**
 * ポーチ(F2)。
 * 薬草の個株に近づいて「E 摘む」とポーチに入る。摘んだ株はぷるんと縮んで消え、
 * ゲーム内2日たつと同じ場所に再生する。上限や重さはなし(管理ゲーにしない)。
 * 調合や依頼の納品もこのポーチの中身を使うため、
 * getItemCount / grantItem / consumeItems を公開している(土台API)。
 */

const VERSION = 1;
/** この表面距離まで近づいたら摘める(図鑑の発見1.7より少し狭い) */
const PICK_DISTANCE = 1.5;
/** 摘んだ株が再生するまでのゲーム内日数 */
const REGROW_DAYS = 2;
/** 縮む・育つアニメーションの速さ(1/秒) */
const SCALE_SPEED = 3.5;

interface PouchSave {
  counts: Record<string, number>;
  picked: Array<{ index: number; day: number }>;
}

interface ScaleAnim {
  mesh: THREE.Group;
  baseScale: THREE.Vector3;
  value: number;
  target: number;
}

// --- モジュール状態(公開APIから触るためsetupの外に置く) ---
let counts: Record<string, number> = {};
let picked = new Map<number, number>();
let eventsRef: EventBus | null = null;
let refreshPanel: () => void = () => {};
let anims: ScaleAnim[] = [];

const save = () => {
  saveFeatureData('pouch', VERSION, {
    counts,
    picked: [...picked.entries()].map(([index, day]) => ({ index, day })),
  } satisfies PouchSave);
};

/** いま持っている数(依頼・調合の判定に使う) */
export function getItemCount(item: string): number {
  return counts[item] ?? 0;
}

/** アイテムを増やす(調合の成果物・お礼の品など) */
export function grantItem(item: string, count = 1): void {
  counts[item] = (counts[item] ?? 0) + count;
  save();
  refreshPanel();
  eventsRef?.emit('item-changed', { item, count: counts[item]! });
}

/** まとめて消費する。1つでも足りなければ何もせずfalse(納品・調合用) */
export function consumeItems(
  needs: ReadonlyArray<{ item: string; count: number }>
): boolean {
  if (needs.some((need) => getItemCount(need.item) < need.count)) return false;
  for (const need of needs) {
    counts[need.item] = (counts[need.item] ?? 0) - need.count;
    eventsRef?.emit('item-changed', { item: need.item, count: counts[need.item]! });
  }
  save();
  refreshPanel();
  return true;
}

export const pouchFeature: Feature = {
  id: 'pouch',
  setup(ctx: FeatureContext): void {
    eventsRef = ctx.events;
    const saved = loadFeatureData<PouchSave>('pouch', VERSION);
    counts = saved?.counts ?? {};
    picked = new Map(saved?.picked.map((entry) => [entry.index, entry.day]) ?? []);

    anims = [];
    const animByIndex = new Map<number, ScaleAnim>();
    const sightings = ctx.world.herbSightings;

    const animFor = (index: number): ScaleAnim | null => {
      const mesh = sightings[index]?.mesh;
      if (!mesh) return null;
      let anim = animByIndex.get(index);
      if (!anim) {
        anim = { mesh, baseScale: mesh.scale.clone(), value: 1, target: 1 };
        animByIndex.set(index, anim);
        anims.push(anim);
      }
      return anim;
    };

    // 前回摘んだままの株は、最初から消えた状態にしておく
    for (const [index] of picked) {
      const anim = animFor(index);
      if (!anim) continue;
      anim.value = 0;
      anim.target = 0;
      anim.mesh.visible = false;
    }

    // すべての株を「摘める対象」として登録する
    sightings.forEach((sighting, index) => {
      if (!sighting.mesh) return;
      addInteractable({
        direction: sighting.direction,
        radius: PICK_DISTANCE,
        label: '摘む',
        enabled: () => !picked.has(index),
        onUse: () => {
          picked.set(index, currentDay());
          const anim = animFor(index);
          if (anim) anim.target = 0;
          counts[sighting.species] = (counts[sighting.species] ?? 0) + 1;
          save();
          refreshPanel();
          ctx.events.emit('item-picked', { item: sighting.species });
          ctx.events.emit('item-changed', {
            item: sighting.species,
            count: counts[sighting.species]!,
          });
        },
      });
    });

    // 日付が進んだら、時間のたった株を再生させる
    ctx.events.on('day-passed', ({ day }) => {
      let changed = false;
      for (const [index, pickedDay] of picked) {
        if (day - pickedDay < REGROW_DAYS) continue;
        picked.delete(index);
        const anim = animFor(index);
        if (anim) {
          anim.mesh.visible = true;
          anim.target = 1;
        }
        changed = true;
      }
      if (changed) save();
    });

    // --- ポーチボタンとパネル(図鑑と同じ紙調) ---
    const host = document.querySelector('#hud-buttons') ?? document.body;
    const button = document.createElement('button');
    button.className = 'hud-button';
    button.id = 'pouch-toggle';
    button.title = '薬草ポーチ';
    button.textContent = '🧺';
    host.appendChild(button);

    const panel = document.createElement('div');
    panel.id = 'pouch-panel';
    document.body.appendChild(panel);
    button.addEventListener('click', () => panel.classList.toggle('open'));
    window.addEventListener('pointerdown', (event) => {
      if (!panel.classList.contains('open')) return;
      const target = event.target;
      if (target instanceof Node && (panel.contains(target) || button.contains(target))) return;
      panel.classList.remove('open');
    });

    refreshPanel = () => {
      panel.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'pouch-title';
      title.textContent = '薬草ポーチ';
      panel.appendChild(title);
      const owned = ITEMS.filter((item) => (counts[item.id] ?? 0) > 0);
      if (owned.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'pouch-empty';
        empty.textContent = 'まだ何も入っていない。薬草に近づいて摘んでみよう。';
        panel.appendChild(empty);
        return;
      }
      for (const item of owned) {
        const row = document.createElement('div');
        row.className = 'pouch-row';
        const icon = document.createElement('div');
        icon.className = 'pouch-icon';
        icon.innerHTML = itemIcon(item.id);
        const name = document.createElement('div');
        name.className = 'pouch-name';
        name.textContent = itemName(item.id);
        const count = document.createElement('div');
        count.className = 'pouch-count';
        count.textContent = `× ${counts[item.id]}`;
        row.append(icon, name, count);
        panel.appendChild(row);
      }
    };
    refreshPanel();
  },
  update(deltaTime: number): void {
    // 摘んだ株の縮み・再生の育ちをなめらかに動かす
    for (const anim of anims) {
      if (anim.value === anim.target) continue;
      const step = SCALE_SPEED * deltaTime;
      anim.value =
        anim.value < anim.target
          ? Math.min(anim.target, anim.value + step)
          : Math.max(anim.target, anim.value - step);
      // 縮むときは少しふくらんでから消える"ぷるん"、育つときはそのまま
      const eased =
        anim.target === 0 ? anim.value * (2 - anim.value) : anim.value * anim.value;
      anim.mesh.scale.copy(anim.baseScale).multiplyScalar(Math.max(eased, 0.0001));
      if (anim.value === 0) anim.mesh.visible = false;
    }
  },
};
