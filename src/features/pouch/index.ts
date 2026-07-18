import './style.css';
import type * as THREE from 'three';
import { HERB_SPECIES, HERB_ICONS } from '../../journal.ts';
import type { Feature, FeatureContext } from '../feature.ts';
import { addInteractable } from '../interact/index.ts';
import { loadFeatureData, saveFeatureData } from '../save.ts';
import { currentDay } from '../clock.ts';

/**
 * 薬草ポーチ(F2)。
 * 薬草の個株に近づいて「E 摘む」とポーチに入る。摘んだ株はぷるんと縮んで消え、
 * ゲーム内2日たつと同じ場所に再生する。上限や重さはなし(管理ゲーにしない)。
 * 摘んだ株と所持数は localStorage に保存される。
 */

const VERSION = 1;
/** この表面距離まで近づいたら摘める(図鑑の発見1.7より少し狭い) */
const PICK_DISTANCE = 1.5;
/** 摘んだ株が再生するまでのゲーム内日数 */
const REGROW_DAYS = 2;
/** 縮む・育つアニメーションの速さ(1/秒) */
const SCALE_SPEED = 3.5;

interface PouchSave {
  /** 種類ID → 所持数 */
  counts: Record<string, number>;
  /** 摘まれて再生待ちの株(herbSightingsのindexと摘んだ日) */
  picked: Array<{ index: number; day: number }>;
}

/** 見た目の縮み・育ちをなめらかにするためのアニメーション状態 */
interface ScaleAnim {
  mesh: THREE.Group;
  baseScale: THREE.Vector3;
  /** 0=消えた状態、1=元の大きさ */
  value: number;
  target: number;
}

const speciesName = new Map(HERB_SPECIES.map((entry) => [entry.id, entry.name]));

export const pouchFeature: Feature = {
  id: 'pouch',
  setup(ctx: FeatureContext): void {
    const saved = loadFeatureData<PouchSave>('pouch', VERSION);
    const counts: Record<string, number> = saved?.counts ?? {};
    const picked = new Map<number, number>(); // index → 摘んだ日
    for (const entry of saved?.picked ?? []) picked.set(entry.index, entry.day);

    const save = () => {
      saveFeatureData('pouch', VERSION, {
        counts,
        picked: [...picked.entries()].map(([index, day]) => ({ index, day })),
      } satisfies PouchSave);
    };

    const anims: ScaleAnim[] = [];
    const animByIndex = new Map<number, ScaleAnim>();
    const sightings = ctx.world.herbSightings;

    /** 株のアニメーション状態を(必要なら作って)返す */
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

    const refreshPanel = () => {
      panel.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'pouch-title';
      title.textContent = '薬草ポーチ';
      panel.appendChild(title);
      const owned = HERB_SPECIES.filter((species) => (counts[species.id] ?? 0) > 0);
      if (owned.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'pouch-empty';
        empty.textContent = 'まだ何も入っていない。薬草に近づいて摘んでみよう。';
        panel.appendChild(empty);
        return;
      }
      for (const species of owned) {
        const row = document.createElement('div');
        row.className = 'pouch-row';
        const icon = document.createElement('div');
        icon.className = 'pouch-icon';
        icon.innerHTML = HERB_ICONS[species.id] ?? '';
        const name = document.createElement('div');
        name.className = 'pouch-name';
        name.textContent = speciesName.get(species.id) ?? species.id;
        const count = document.createElement('div');
        count.className = 'pouch-count';
        count.textContent = `× ${counts[species.id]}`;
        row.append(icon, name, count);
        panel.appendChild(row);
      }
    };
    refreshPanel();

    // update から参照するためにモジュール状態へ
    pouchAnims = anims;
  },
  update(deltaTime: number): void {
    // 摘んだ株の縮み・再生の育ちをなめらかに動かす
    for (const anim of pouchAnims) {
      if (anim.value === anim.target) continue;
      const step = SCALE_SPEED * deltaTime;
      anim.value =
        anim.value < anim.target
          ? Math.min(anim.target, anim.value + step)
          : Math.max(anim.target, anim.value - step);
      // 縮むときは少しふくらんでから消える"ぷるん"、育つときはそのまま
      const eased =
        anim.target === 0 ? anim.value * (2 - anim.value) : anim.value * anim.value;
      anim.mesh.scale
        .copy(anim.baseScale)
        .multiplyScalar(Math.max(eased, 0.0001));
      if (anim.value === 0) anim.mesh.visible = false;
    }
  },
};

let pouchAnims: ScaleAnim[] = [];
