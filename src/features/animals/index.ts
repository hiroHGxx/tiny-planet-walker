import './style.css';
import * as THREE from 'three';
import type { Feature, FeatureContext } from '../feature.ts';
import { addInteractable } from '../interact/index.ts';
import { grantItem } from '../pouch/index.ts';
import { loadFeatureData, saveFeatureData } from '../save.ts';
import { currentDay } from '../clock.ts';
import { currentPlanet } from '../planet-state.ts';

/**
 * 動物とのふれあい(F10)。
 * 鳥・うさぎ・ひつじに「E なでる」でハートが浮かぶ。
 * ひつじは「E 毛を刈る」で羊毛が採れる(ゲーム内3日で生えそろう。
 * 刈ったあとはひとまわり小さい見た目になる)。
 */

const VERSION = 1;
const PET_DISTANCE = 1.6;
const REGROW_DAYS = 3;
/** 毛を刈られたひつじの見た目の縮み */
const SHEARED_SCALE = 0.8;

const _anchor = new THREE.Vector3();
const _projected = new THREE.Vector3();

export const animalsFeature: Feature = {
  id: 'animals',
  setup(ctx: FeatureContext): void {
    // 星ごとに別のセーブにする(羊は星ごとに別の個体。indexの流用を防ぐ)
    const saveKey = `animals-p${currentPlanet()}`;
    const saved = loadFeatureData<{ sheared: Array<{ index: number; day: number }> }>(
      saveKey,
      VERSION
    );
    const sheared = new Map(
      Array.isArray(saved?.sheared)
        ? saved.sheared.map((entry) => [entry.index, entry.day] as const)
        : []
    );
    const save = () =>
      saveFeatureData(saveKey, VERSION, {
        sheared: [...sheared.entries()].map(([index, day]) => ({ index, day })),
      });

    // ハートのDOMレイヤー(スクリーン座標に浮かべて消す)
    const layer = document.createElement('div');
    layer.id = 'heart-layer';
    document.body.appendChild(layer);
    const showHeart = (mesh: THREE.Group) => {
      _anchor.copy(mesh.position).normalize().multiplyScalar(mesh.position.length() + 0.9);
      _projected.copy(_anchor).project(ctx.camera);
      if (_projected.z > 1) return;
      const heart = document.createElement('div');
      heart.className = 'float-heart';
      heart.textContent = '💚';
      heart.style.left = `${(_projected.x * 0.5 + 0.5) * window.innerWidth}px`;
      heart.style.top = `${(-_projected.y * 0.5 + 0.5) * window.innerHeight}px`;
      layer.appendChild(heart);
      window.setTimeout(() => heart.remove(), 1100);
    };

    ctx.world.wildlife.forEach((animal, index) => {
      const direction = animal.mesh.position.clone().normalize();
      animalDirections.push({ mesh: animal.mesh, direction });

      // なでる(全部の動物)
      addInteractable({
        direction,
        radius: PET_DISTANCE,
        label: 'なでる',
        priority: 3,
        enabled: () => animal.mesh.visible,
        onUse: () => showHeart(animal.mesh),
      });

      // 毛を刈る(ひつじだけ。なでるより優先)
      if (animal.kind !== 'sheep') return;
      if (sheared.has(index)) animal.mesh.scale.setScalar(SHEARED_SCALE);
      addInteractable({
        direction,
        radius: PET_DISTANCE,
        label: '毛を刈る',
        priority: 4,
        enabled: () => animal.mesh.visible && !sheared.has(index),
        onUse: () => {
          sheared.set(index, currentDay());
          animal.mesh.scale.setScalar(SHEARED_SCALE);
          save();
          grantItem('wool');
          showHeart(animal.mesh);
          ctx.events.emit('item-picked', { item: 'wool' });
        },
      });
    });

    // 日付が進んだら毛が生えそろう
    ctx.events.on('day-passed', ({ day }) => {
      let changed = false;
      for (const [index, shearedDay] of sheared) {
        if (day - shearedDay < REGROW_DAYS) continue;
        sheared.delete(index);
        ctx.world.wildlife[index]?.mesh.scale.setScalar(1);
        changed = true;
      }
      if (changed) save();
    });
  },
  update(): void {
    // 動物は歩き回るので、話しかけ判定の方向を追従させる
    for (const entry of animalDirections) {
      entry.direction.copy(entry.mesh.position).normalize();
    }
  },
};

const animalDirections: Array<{ mesh: THREE.Group; direction: THREE.Vector3 }> = [];
