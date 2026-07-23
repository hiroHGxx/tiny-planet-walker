import * as THREE from 'three';
import { PALETTE, toonMaterial, flatGeometry } from '../../palette.ts';
import { PLANET_RADIUS, OEN_HOME, OEN_JUNCTION } from '../../world.ts';
import { HERB_SPECIES } from '../../journal.ts';
import type { Feature, FeatureContext } from '../feature.ts';
import { addInteractable } from '../interact/index.ts';
import { getItemCount, consumeItems, grantItem } from '../pouch/index.ts';
import { loadFeatureData, saveFeatureData } from '../save.ts';
import { currentDay } from '../clock.ts';
import { currentPlanet } from '../planet-state.ts';

/**
 * 種まきの畑(F12)。おえんちゃんの家の横に3マス。
 * 「ふしぎな種」(お手伝いのお礼などで入手)をまくと、
 * ゲーム内2日かけて 芽 → 葉 → 花 と育ち、どの薬草になるかは咲いてのお楽しみ。
 * 水やり・枯れはなし(世話ゲーにしない)。畑の状態は星ごとに保存。
 */

const VERSION = 1;
const GROW_DAYS = 2;

interface Plot {
  herb: string;
  day: number;
}

export const gardenFeature: Feature = {
  id: 'garden',
  setup(ctx: FeatureContext): void {
    const saveKey = `garden-p${currentPlanet()}`;
    const saved = loadFeatureData<{ plots: Array<Plot | null> }>(saveKey, VERSION);
    const plots: Array<Plot | null> = saved?.plots ?? [null, null, null];
    const save = () => saveFeatureData(saveKey, VERSION, { plots });

    // 家の横(小道と反対側)に3マス並べる
    const away = OEN_HOME.clone()
      .multiplyScalar(2)
      .sub(OEN_JUNCTION)
      .normalize();
    const side = new THREE.Vector3().crossVectors(OEN_HOME, away).normalize();
    const stageMeshes: THREE.Group[][] = [];

    plots.forEach((_, index) => {
      const direction = OEN_HOME.clone()
        .lerp(away, 0.075)
        .addScaledVector(side, (index - 1) * 0.032)
        .normalize();

      // 土のうね
      const mound = new THREE.Mesh(
        flatGeometry(new THREE.SphereGeometry(0.42, 8, 6)),
        toonMaterial(PALETTE.soil)
      );
      mound.scale.y = 0.35;
      const base = new THREE.Group();
      base.add(mound);
      base.position.copy(direction).multiplyScalar(PLANET_RADIUS);
      base.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      ctx.scene.add(base);

      // 成長段階の見た目(芽・葉・花)を作って全部隠しておく
      const sprout = new THREE.Group();
      const shoot = new THREE.Mesh(
        flatGeometry(new THREE.ConeGeometry(0.06, 0.22, 6)),
        toonMaterial(PALETTE.leaf)
      );
      shoot.position.y = 0.24;
      sprout.add(shoot);

      const young = new THREE.Group();
      const stemMesh = new THREE.Mesh(
        flatGeometry(new THREE.CylinderGeometry(0.03, 0.04, 0.34, 6)),
        toonMaterial(PALETTE.stem)
      );
      stemMesh.position.y = 0.3;
      young.add(stemMesh);
      for (const leafSide of [-1, 1]) {
        const leaf = new THREE.Mesh(
          flatGeometry(new THREE.SphereGeometry(0.09, 7, 5)),
          toonMaterial(PALETTE.leaf)
        );
        leaf.position.set(leafSide * 0.11, 0.36, 0);
        young.add(leaf);
      }

      const bloom = new THREE.Group();
      const stem2 = stemMesh.clone();
      stem2.scale.y = 1.3;
      stem2.position.y = 0.36;
      bloom.add(stem2);
      const flower = new THREE.Mesh(
        flatGeometry(new THREE.SphereGeometry(0.13, 8, 6)),
        toonMaterial(PALETTE.flowerCenter, 0x4a3a10)
      );
      flower.position.y = 0.62;
      bloom.add(flower);
      for (let p = 0; p < 5; p++) {
        const petal = new THREE.Mesh(
          flatGeometry(new THREE.SphereGeometry(0.07, 6, 5)),
          toonMaterial(PALETTE.petal)
        );
        const angle = (p / 5) * Math.PI * 2;
        petal.position.set(Math.cos(angle) * 0.16, 0.62, Math.sin(angle) * 0.16);
        bloom.add(petal);
      }

      for (const stage of [sprout, young, bloom]) {
        stage.visible = false;
        base.add(stage);
      }
      stageMeshes.push([sprout, young, bloom]);

      // まく(空きマス+種があるとき)
      // 優先度はドア(8)より上げる。畑3マスはドア判定(半径2.2)の圏内にあるため、
      // 同じ場所ではドアより畑を優先しないと「たねをまく」が一切出せない
      addInteractable({
        direction,
        radius: 1.4,
        label: 'たねをまく',
        priority: 9,
        enabled: () => !plots[index] && getItemCount('seed_mix') > 0,
        onUse: () => {
          if (!consumeItems([{ item: 'seed_mix', count: 1 }])) return;
          const herb = HERB_SPECIES[Math.floor(Math.random() * HERB_SPECIES.length)]!;
          plots[index] = { herb: herb.id, day: currentDay() };
          save();
          refresh();
        },
      });
      // 摘む(咲いたとき)
      addInteractable({
        direction,
        radius: 1.4,
        label: '摘む',
        priority: 9,
        enabled: () => {
          const plot = plots[index];
          return !!plot && currentDay() - plot.day >= GROW_DAYS;
        },
        onUse: () => {
          const plot = plots[index];
          if (!plot) return;
          grantItem(plot.herb);
          ctx.events.emit('item-picked', { item: plot.herb });
          plots[index] = null;
          save();
          refresh();
        },
      });
    });

    /** 保存状態と日付から、各マスの見た目を出し分ける */
    const refresh = () => {
      plots.forEach((plot, index) => {
        const stages = stageMeshes[index]!;
        const age = plot ? currentDay() - plot.day : -1;
        stages[0]!.visible = age === 0;
        stages[1]!.visible = age === 1;
        stages[2]!.visible = age >= GROW_DAYS;
      });
    };
    refresh();
    ctx.events.on('day-passed', refresh);
  },
};
