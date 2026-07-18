import * as THREE from 'three';
import type { Feature, FeatureContext } from '../feature.ts';

/**
 * 天気(F8)。晴れ・くもり・雨・霧を数分単位でゆるく巡らせる。
 * 雨=プレイヤーの頭上に付いていくPoints+コード合成の雨音(audio経由)、
 * 霧=scene.fog。夜は雨を控えめにする。見た目と音だけで、遊びは邪魔しない。
 */

type WeatherKind = 'sunny' | 'cloudy' | 'rain' | 'fog';

/** 1つの天気が続く時間(秒) */
const SPELL_MIN = 100;
const SPELL_MAX = 220;
const RAIN_COUNT = 700;
/** 雨粒が降る箱のサイズ(プレイヤー基準のローカル座標) */
const RAIN_BOX = { x: 26, y: 16, z: 26 };

const _normal = new THREE.Vector3();
const _rainQuat = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export const weatherFeature: Feature = {
  id: 'weather',
  setup(ctx: FeatureContext): void {
    // 雨粒:細い線に見えるよう縦長に散らした点群
    const positions = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * RAIN_BOX.x;
      positions[i * 3 + 1] = Math.random() * RAIN_BOX.y;
      positions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_BOX.z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xcfdcff,
      size: 0.09,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const rain = new THREE.Points(geometry, material);
    rain.visible = false;
    ctx.scene.add(rain);

    weatherState = { kind: 'sunny', timer: 60 + Math.random() * 60, rain, material, geometry };
  },
  update(deltaTime: number, ctx: FeatureContext): void {
    const state = weatherState;
    if (!state) return;

    // --- 天気の遷移 ---
    state.timer -= deltaTime;
    if (state.timer <= 0) {
      const night = ctx.sunElevation() < -0.05;
      const roll = Math.random();
      // 夜は雨を控えめに(星空を大事にする)
      const next: WeatherKind =
        roll < (night ? 0.55 : 0.45)
          ? 'sunny'
          : roll < 0.7
            ? 'cloudy'
            : roll < (night ? 0.82 : 0.9)
              ? 'rain'
              : 'fog';
      if (next !== state.kind) {
        state.kind = next;
        ctx.events.emit('weather-changed', { weather: next });
      }
      state.timer = SPELL_MIN + Math.random() * (SPELL_MAX - SPELL_MIN);
    }

    // --- 見た目と音への反映 ---
    const raining = state.kind === 'rain' && ctx.director.mode === 'planet';
    ctx.audio.setRainLevel(state.kind === 'rain' ? (ctx.director.mode === 'planet' ? 1 : 0.35) : 0);

    // 霧はゆっくり出し入れする
    const wantFog = state.kind === 'fog' && ctx.director.mode === 'planet';
    if (wantFog && !ctx.scene.fog) {
      ctx.scene.fog = new THREE.Fog(0x9a94b8, 8, 30);
    } else if (!wantFog && ctx.scene.fog) {
      ctx.scene.fog = null;
    }

    // 雨粒:プレイヤーの頭上へ移動し、足元(球の中心方向)へ降らせる
    state.rain.visible = raining;
    const opacityTarget = raining ? 0.55 : 0;
    state.material.opacity += (opacityTarget - state.material.opacity) * (1 - Math.exp(-3 * deltaTime));
    if (raining) {
      _normal.copy(ctx.player.mesh.position).normalize();
      state.rain.position.copy(ctx.player.mesh.position);
      _rainQuat.setFromUnitVectors(UP, _normal);
      state.rain.quaternion.copy(_rainQuat);
      const positions = state.geometry.attributes.position as THREE.BufferAttribute;
      const array = positions.array as Float32Array;
      for (let i = 0; i < RAIN_COUNT; i++) {
        let y = array[i * 3 + 1]! - 14 * deltaTime;
        if (y < -2) y += RAIN_BOX.y;
        array[i * 3 + 1] = y;
      }
      positions.needsUpdate = true;
    }
  },
};

let weatherState: {
  kind: WeatherKind;
  timer: number;
  rain: THREE.Points;
  material: THREE.PointsMaterial;
  geometry: THREE.BufferGeometry;
} | null = null;
