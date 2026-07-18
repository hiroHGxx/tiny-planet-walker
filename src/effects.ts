import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { PALETTE } from './palette.ts';

/**
 * ポストプロセス(画面全体への後処理)。
 * 描画順:通常描画 → 輪郭線 → ブルーム → ビネット+彩度 → 出力変換
 */

/**
 * 深度ベースの輪郭線パス。
 * シーンの深度だけをもう一度描き、隣のピクセルと深度が大きく違う場所
 * (=物の輪郭)に柔らかい色の線を引く。
 * Points・半透明・userData.noOutline のオブジェクトは対象から外す。
 */
class ToonOutlinePass extends Pass {
  private sceneRef: THREE.Scene;
  private cameraRef: THREE.PerspectiveCamera;
  private readonly depthTarget: THREE.WebGLRenderTarget;
  private readonly depthMaterial: THREE.MeshDepthMaterial;
  private readonly fsQuad: FullScreenQuad;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly pixelRatio: number;
  private readonly hidden: THREE.Object3D[] = [];
  private readonly clearColor = new THREE.Color();

  /** 描画対象を切り替える(家の中シーンなど)。深度の換算もカメラに合わせ直す */
  setView(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.sceneRef = scene;
    this.cameraRef = camera;
    this.uniforms.uCameraNear!.value = camera.near;
    this.uniforms.uCameraFar!.value = camera.far;
  }

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, pixelRatio: number) {
    super();
    this.sceneRef = scene;
    this.cameraRef = camera;
    this.pixelRatio = pixelRatio;

    // 深度をRGBAに詰めて色として書き出す(WebGLの定番テクニック)
    this.depthMaterial = new THREE.MeshDepthMaterial();
    this.depthMaterial.depthPacking = THREE.RGBADepthPacking;
    this.depthMaterial.blending = THREE.NoBlending;
    this.depthTarget = new THREE.WebGLRenderTarget(1, 1);

    this.uniforms = {
      tDiffuse: { value: null },
      tDepth: { value: this.depthTarget.texture },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uCameraNear: { value: camera.near },
      uCameraFar: { value: camera.far },
      uOutlineColor: { value: new THREE.Color(PALETTE.outline) },
      uStrength: { value: 0.75 },
    };
    this.fsQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          #include <packing>
          uniform sampler2D tDiffuse;
          uniform sampler2D tDepth;
          uniform vec2 uResolution;
          uniform float uCameraNear;
          uniform float uCameraFar;
          uniform vec3 uOutlineColor;
          uniform float uStrength;
          varying vec2 vUv;

          // パックされた深度をビュー空間の距離(ワールド単位)に戻す
          float readViewZ(vec2 uv) {
            float depth = unpackRGBAToDepth(texture2D(tDepth, uv));
            return -perspectiveDepthToViewZ(depth, uCameraNear, uCameraFar);
          }

          void main() {
            vec2 texel = 1.0 / uResolution;
            float center = readViewZ(vUv);
            // 上下左右の4方向と深度を比べ、最大の差を輪郭の強さにする
            float diff = 0.0;
            diff = max(diff, abs(readViewZ(vUv + vec2(texel.x, 0.0)) - center));
            diff = max(diff, abs(readViewZ(vUv - vec2(texel.x, 0.0)) - center));
            diff = max(diff, abs(readViewZ(vUv + vec2(0.0, texel.y)) - center));
            diff = max(diff, abs(readViewZ(vUv - vec2(0.0, texel.y)) - center));
            // 遠くほど深度差が出やすいので、しきい値を距離でゆるめる
            float threshold = 0.14 + center * 0.03;
            float edge = smoothstep(threshold, threshold * 2.2, diff);
            vec3 color = texture2D(tDiffuse, vUv).rgb;
            gl_FragColor = vec4(mix(color, uOutlineColor, edge * uStrength), 1.0);
          }
        `,
      })
    );
  }

  override setSize(width: number, height: number): void {
    const w = Math.round(width * this.pixelRatio);
    const h = Math.round(height * this.pixelRatio);
    this.depthTarget.setSize(w, h);
    (this.uniforms.uResolution!.value as THREE.Vector2).set(w, h);
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ): void {
    const scene = this.sceneRef;

    // --- 1) 深度パス:輪郭を出したくないものを一時的に隠して深度だけ描く ---
    this.hidden.length = 0;
    scene.traverse((object) => {
      if (!object.visible) return;
      const mesh = object as THREE.Mesh;
      const isExcluded =
        (object as THREE.Points).isPoints === true ||
        object.userData.noOutline === true ||
        (mesh.isMesh && (mesh.material as THREE.Material).transparent === true);
      if (isExcluded) {
        object.visible = false;
        this.hidden.push(object);
      }
    });

    const prevOverride = scene.overrideMaterial;
    const prevTarget = renderer.getRenderTarget();
    const prevShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(this.clearColor);
    const prevClearAlpha = renderer.getClearAlpha();

    // シャドウマップは直前の通常描画で更新済みなので、深度パスでは再計算しない
    renderer.shadowMap.autoUpdate = false;
    scene.overrideMaterial = this.depthMaterial;
    renderer.setClearColor(0xffffff, 1); // 白 = パックされた「最遠」の深度
    renderer.setRenderTarget(this.depthTarget);
    renderer.clear();
    renderer.render(scene, this.cameraRef);

    // 後片付け
    scene.overrideMaterial = prevOverride;
    renderer.setClearColor(this.clearColor, prevClearAlpha);
    renderer.shadowMap.autoUpdate = prevShadowAutoUpdate;
    for (const object of this.hidden) object.visible = true;
    this.hidden.length = 0;

    // --- 2) 合成パス:輪郭を重ねて出力する ---
    this.uniforms.tDiffuse!.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
    renderer.setRenderTarget(prevTarget);
  }
}

/** ビネット(周辺減光)+わずかな彩度アップ */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.1 },
    uVignette: { value: 0.3 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      // 彩度を少し持ち上げる
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(luma), color, uSaturation);
      // 画面の四隅をほんのり暗くして視線を中央に集める
      float dist = distance(vUv, vec2(0.5));
      color *= 1.0 - smoothstep(0.45, 0.85, dist) * uVignette;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export interface Effects {
  render: () => void;
  setSize: (width: number, height: number) => void;
  /** 描画対象のシーンとカメラを切り替える(星の上 ⇄ 家の中) */
  setView: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void;
}

export function createEffects(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera
): Effects {
  const size = renderer.getSize(new THREE.Vector2());
  const pixelRatio = renderer.getPixelRatio();

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pixelRatio);

  const renderPass = new RenderPass(scene, camera);
  const outlinePass = new ToonOutlinePass(scene, camera, pixelRatio);
  composer.addPass(renderPass);
  composer.addPass(outlinePass);
  // ブルーム:明るい部分(灯り・光る薬草・太陽側の空)だけを淡くにじませる
  composer.addPass(
    new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.5, 0.82)
  );
  composer.addPass(new ShaderPass(GradeShader));
  composer.addPass(new OutputPass());

  composer.setSize(size.x, size.y);

  return {
    render: () => composer.render(),
    setSize: (width, height) => composer.setSize(width, height),
    setView: (nextScene, nextCamera) => {
      renderPass.scene = nextScene;
      renderPass.camera = nextCamera;
      outlinePass.setView(nextScene, nextCamera);
    },
  };
}
