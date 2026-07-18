import * as THREE from 'three';
import type { Feature, FeatureContext } from '../feature.ts';
import { planetDef } from '../../content/planets.ts';
import { currentPlanet } from '../planet-state.ts';

/**
 * 天気(F8)。晴れ・くもり・雨・霧を数分単位でゆるく巡らせる。
 * 雨=プレイヤーの頭上に付いていくPoints+コード合成の雨音(audio経由)、
 * 霧=scene.fog。夜は雨を控えめにする。見た目と音だけで、遊びは邪魔しない。
 * 星の台帳のtheme.weatherで出やすさの偏りを(夏=晴れ多めなど)、
 * theme.snowで降りものを雪(白く・ゆっくり・音控えめ)に切り替えられる。
 */

type WeatherKind = 'sunny' | 'cloudy' | 'rain' | 'fog';

/** 1つの天気が続く時間(秒) */
const SPELL_MIN = 100;
const SPELL_MAX = 220;
const RAIN_COUNT = 700;
/** 雨粒が降る箱のサイズ(プレイヤー基準のローカル座標) */
const RAIN_BOX = { x: 26, y: 16, z: 26 };

/** 天気の重みの共通デフォルト(いままでの確率と同じ配分) */
const DEFAULT_WEIGHTS = { sunny: 0.45, cloudy: 0.25, rain: 0.2, fog: 0.1 };

/** 重みにしたがって次の天気を引く(夜は雨・霧を下げて星空を大事にする) */
function rollWeather(night: boolean): WeatherKind {
  const base = planetDef(currentPlanet()).theme?.weather ?? DEFAULT_WEIGHTS;
  const weights: Record<WeatherKind, number> = {
    sunny: base.sunny,
    cloudy: base.cloudy,
    rain: base.rain * (night ? 0.55 : 1),
    fog: base.fog * (night ? 0.8 : 1),
  };
  let roll = Math.random() * (weights.sunny + weights.cloudy + weights.rain + weights.fog);
  for (const kind of ['sunny', 'cloudy', 'rain', 'fog'] as const) {
    roll -= weights[kind];
    if (roll <= 0) return kind;
  }
  return 'sunny';
}

const _normal = new THREE.Vector3();
const _rainQuat = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export const weatherFeature: Feature = {
  id: 'weather',
  setup(ctx: FeatureContext): void {
    const snow = planetDef(currentPlanet()).theme?.snow ?? false;
    // 雨粒:細い線に見えるよう縦長に散らした点群(雪の星では白く大きめの粒)
    const positions = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * RAIN_BOX.x;
      positions[i * 3 + 1] = Math.random() * RAIN_BOX.y;
      positions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_BOX.z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: snow ? 0xffffff : 0xcfdcff,
      size: snow ? 0.13 : 0.09,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const rain = new THREE.Points(geometry, material);
    rain.visible = false;
    ctx.scene.add(rain);

    weatherState = { kind: 'sunny', timer: 60 + Math.random() * 60, rain, material, geometry, snow };
  },
  update(deltaTime: number, ctx: FeatureContext): void {
    const state = weatherState;
    if (!state) return;

    // --- 天気の遷移 ---
    state.timer -= deltaTime;
    if (state.timer <= 0) {
      const next = rollWeather(ctx.sunElevation() < -0.05);
      if (next !== state.kind) {
        state.kind = next;
        ctx.events.emit('weather-changed', { weather: next });
      }
      state.timer = SPELL_MIN + Math.random() * (SPELL_MAX - SPELL_MIN);
    }

    // --- 見た目と音への反映 ---
    const raining = state.kind === 'rain' && ctx.director.mode === 'planet';
    // 雪は無音の降りもの(雨音を鳴らさない)
    const rainLevel = state.snow ? 0 : ctx.director.mode === 'planet' ? 1 : 0.35;
    ctx.audio.setRainLevel(state.kind === 'rain' ? rainLevel : 0);

    // 霧はゆっくり出し入れする
    const wantFog = state.kind === 'fog' && ctx.director.mode === 'planet';
    if (wantFog && !ctx.scene.fog) {
      ctx.scene.fog = new THREE.Fog(0x9a94b8, 8, 30);
    } else if (!wantFog && ctx.scene.fog) {
      ctx.scene.fog = null;
    }

    // くもり・雨の日は昼の光を落とす(なめらかに寄せる)
    const daylightTarget =
      state.kind === 'sunny' ? 1 : state.kind === 'fog' ? 0.75 : 0.55;
    daylight += (daylightTarget - daylight) * (1 - Math.exp(-1.5 * deltaTime));
    ctx.world.setDaylight(daylight);

    // 雨粒:プレイヤーの頭上へ移動し、足元(球の中心方向)へ降らせる
    state.rain.visible = raining;
    const opacityTarget = raining ? (state.snow ? 0.75 : 0.55) : 0;
    state.material.opacity += (opacityTarget - state.material.opacity) * (1 - Math.exp(-3 * deltaTime));
    if (raining) {
      _normal.copy(ctx.player.mesh.position).normalize();
      state.rain.position.copy(ctx.player.mesh.position);
      _rainQuat.setFromUnitVectors(UP, _normal);
      state.rain.quaternion.copy(_rainQuat);
      const fallSpeed = state.snow ? 3.2 : 14; // 雪はふわりと落ちる
      const positions = state.geometry.attributes.position as THREE.BufferAttribute;
      const array = positions.array as Float32Array;
      for (let i = 0; i < RAIN_COUNT; i++) {
        let y = array[i * 3 + 1]! - fallSpeed * deltaTime;
        if (y < -2) y += RAIN_BOX.y;
        array[i * 3 + 1] = y;
      }
      positions.needsUpdate = true;
    }
  },
};

let daylight = 1;

let weatherState: {
  kind: WeatherKind;
  timer: number;
  rain: THREE.Points;
  material: THREE.PointsMaterial;
  geometry: THREE.BufferGeometry;
  /** この星の降りものが雪かどうか(台帳のtheme.snow) */
  snow: boolean;
} | null = null;
