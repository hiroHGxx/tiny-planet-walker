import './style.css';
import * as THREE from 'three';
import { Npc } from '../../npc.ts';
import { enableShadows, PLANET_RADIUS } from '../../world.ts';
import { NAMED_NPCS, type NamedNpcDef } from '../../content/npcs.ts';
import type { Feature, FeatureContext } from '../feature.ts';
import { addInteractable } from '../interact/index.ts';
import { questConversation, acceptQuest, completeQuest } from '../quests/index.ts';

/**
 * 名前つき村人と会話(F4+F5)。
 * content/npcs.ts の10人を星に増やし、「E 話す」でノベル風の会話窓を開く。
 * 窓の左の似顔絵は画像ファイルではなく、話し相手の3Dモデルを
 * 小さな専用レンダラーでその場で描く(生中継方式)。
 * 依頼の受注・納品の会話は quests 機能の判断に従う。
 */

/** この表面距離まで近づいたら話しかけられる */
const TALK_DISTANCE = 2.2;
/** 会話中にこれ以上離れたら窓を閉じる(歩き去り対策) */
const BREAK_DISTANCE = 4.5;

/** 会話中に堰き止めるキー(Eは会話送りに使う) */
const BLOCKED_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

/** 配置用とは別の、外見決め専用の再現性ある乱数 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface NamedNpc {
  def: NamedNpcDef;
  npc: Npc;
}

// 使い回し用の一時オブジェクト
const _playerDirection = new THREE.Vector3();
const _towards = new THREE.Vector3();

export const talkFeature: Feature = {
  id: 'talk',
  setup(ctx: FeatureContext): void {
    // --- 名前つき村人を星に置く ---
    const villagers: NamedNpc[] = NAMED_NPCS.map((def) => {
      const npc = new Npc(def.home.clone(), mulberry32(def.seed));
      enableShadows(npc.mesh);
      ctx.scene.add(npc.mesh);
      return { def, npc };
    });

    // --- 会話窓のDOM ---
    const window_ = document.createElement('div');
    window_.id = 'talk-window';
    const portraitWrap = document.createElement('div');
    portraitWrap.className = 'talk-portrait';
    const portraitCanvas = document.createElement('canvas');
    portraitCanvas.width = 200;
    portraitCanvas.height = 200;
    portraitWrap.appendChild(portraitCanvas);
    const textCol = document.createElement('div');
    textCol.className = 'talk-text-col';
    const nameRow = document.createElement('div');
    nameRow.className = 'talk-name';
    const textEl = document.createElement('div');
    textEl.className = 'talk-line';
    const hint = document.createElement('div');
    hint.className = 'talk-hint';
    hint.textContent = '▼';
    const choices = document.createElement('div');
    choices.className = 'talk-choices';
    textCol.append(nameRow, textEl, choices);
    window_.append(portraitWrap, textCol, hint);
    document.body.appendChild(window_);

    // --- 似顔絵の生中継(専用の小さなレンダラー) ---
    let portrait: {
      renderer: THREE.WebGLRenderer;
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      clone: THREE.Object3D | null;
    } | null = null;
    const paintPortrait = (npc: Npc) => {
      try {
        if (!portrait) {
          const renderer = new THREE.WebGLRenderer({
            canvas: portraitCanvas,
            antialias: true,
            alpha: true,
          });
          renderer.setSize(200, 200, false);
          const scene = new THREE.Scene();
          scene.add(new THREE.HemisphereLight(0xfff6e0, 0x9a8a6a, 1.5));
          const sun = new THREE.DirectionalLight(0xffffff, 1.9);
          sun.position.set(1.2, 2, 2.4);
          scene.add(sun);
          const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 10);
          portrait = { renderer, scene, camera, clone: null };
        }
        if (portrait.clone) portrait.scene.remove(portrait.clone);
        // 話し相手の3Dモデルを写す(ジオメトリ・マテリアルは共有のまま)
        const clone = npc.mesh.clone(true);
        clone.position.set(0, 0, 0);
        clone.quaternion.identity();
        clone.visible = true;
        clone.traverse((child) => (child.visible = true));
        portrait.scene.add(clone);
        portrait.clone = clone;
        // 顔の高さに正対して、少しだけ見上げる(頭頂部ではなく顔を写す)
        const h = npc.portraitHeight;
        portrait.camera.position.set(0, h * 0.56, h * 0.98);
        portrait.camera.lookAt(0, h * 0.6, 0);
        portrait.renderer.render(portrait.scene, portrait.camera);
      } catch {
        // WebGLコンテキストを増やせない環境では似顔絵なしで会話できればよい
      }
    };

    // --- 会話の進行 ---
    let talking: NamedNpc | null = null;
    let lines: string[] = [];
    let lineIndex = 0;
    /** 全行読み終えたときに出す選択肢(依頼の提案のときだけ) */
    let pendingOffer: (() => void) | null = null;

    const showLine = () => {
      textEl.textContent = lines[lineIndex] ?? '';
      const last = lineIndex >= lines.length - 1;
      hint.style.visibility = last && pendingOffer ? 'hidden' : 'visible';
      if (last && pendingOffer) pendingOffer();
    };

    const closeDialog = () => {
      if (!talking) return;
      talking.npc.release();
      talking = null;
      pendingOffer = null;
      window_.classList.remove('open');
      choices.innerHTML = '';
    };

    const advance = () => {
      if (!talking) return;
      if (lineIndex < lines.length - 1) {
        lineIndex++;
        showLine();
      } else if (!pendingOffer) {
        closeDialog();
      }
    };

    const openDialog = (villager: NamedNpc) => {
      talking = villager;
      const { def, npc } = villager;
      // 立ち止まってプレイヤーの方を向いてもらう
      _towards.copy(ctx.player.mesh.position).sub(npc.mesh.position);
      npc.hold(_towards);
      // 歩き続けたまま会話に入らないよう、押しっぱなしのキーを解除する
      window.dispatchEvent(new Event('blur'));

      nameRow.textContent = `${def.name}(${def.title})`;
      choices.innerHTML = '';
      pendingOffer = null;

      const conversation = questConversation(def.id);
      if (conversation.kind === 'deliver') {
        const quest = conversation.quest;
        if (completeQuest(quest)) {
          lines = [...quest.thanks];
          ctx.events.emit('quest-completed', { questId: quest.id });
        } else {
          lines = [quest.reminder];
        }
      } else if (conversation.kind === 'reminder') {
        lines = [conversation.quest.reminder];
      } else if (conversation.kind === 'offer') {
        const quest = conversation.quest;
        lines = [...quest.intro];
        pendingOffer = () => {
          choices.innerHTML = '';
          const yes = document.createElement('button');
          yes.className = 'talk-choice';
          yes.textContent = 'うける';
          const no = document.createElement('button');
          no.className = 'talk-choice subtle';
          no.textContent = 'またこんど';
          yes.addEventListener('click', (event) => {
            event.stopPropagation();
            acceptQuest(quest);
            ctx.events.emit('quest-started', { questId: quest.id });
            pendingOffer = null;
            choices.innerHTML = '';
            lines = [quest.accept];
            lineIndex = 0;
            showLine();
          });
          no.addEventListener('click', (event) => {
            event.stopPropagation();
            closeDialog();
          });
          choices.append(yes, no);
        };
      } else {
        const pool = def.smalltalk;
        lines = [pool[Math.floor(Math.random() * pool.length)]!];
      }

      lineIndex = 0;
      paintPortrait(npc);
      window_.classList.add('open');
      showLine();
    };

    // 窓クリック・Eキーで会話を送る。会話中は移動キーを堰き止める
    window_.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      advance();
    });
    window.addEventListener(
      'keydown',
      (event) => {
        if (!talking) return;
        if (event.code === 'KeyE' && !event.repeat) {
          advance();
          event.preventDefault();
          event.stopImmediatePropagation();
        } else if (BLOCKED_KEYS.has(event.code)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      { capture: true }
    );

    // --- 話しかけの対象登録(村人は歩くので、毎フレーム方向を追従させる) ---
    for (const villager of villagers) {
      const direction = villager.npc.mesh.position.clone().normalize();
      villager.npc.mesh.userData.talkDirection = direction;
      addInteractable({
        direction,
        radius: TALK_DISTANCE,
        label: `${villager.def.name}と話す`,
        priority: 5,
        enabled: () => !talking && villager.npc.mesh.visible,
        onUse: () => openDialog(villager),
      });
    }

    talkRuntime = { villagers, closeDialog, isTalking: () => talking !== null, talking: () => talking };
  },
  update(_deltaTime: number, ctx: FeatureContext): void {
    if (!talkRuntime || ctx.director.mode !== 'planet') return;
    elapsed += _deltaTime;
    _playerDirection.copy(ctx.player.mesh.position).normalize();
    for (const villager of talkRuntime.villagers) {
      villager.npc.update(elapsed, _playerDirection);
      // 話しかけ判定の方向を現在地に追従させる
      const direction = villager.npc.mesh.userData.talkDirection as THREE.Vector3;
      direction.copy(villager.npc.mesh.position).normalize();
    }
    // 会話中に離れすぎたら(スティック操作など)、窓を静かに閉じる
    const talking = talkRuntime.talking();
    if (talking) {
      const surface =
        Math.acos(
          THREE.MathUtils.clamp(
            _playerDirection.dot(
              talking.npc.mesh.userData.talkDirection as THREE.Vector3
            ),
            -1,
            1
          )
        ) * PLANET_RADIUS;
      if (surface > BREAK_DISTANCE) talkRuntime.closeDialog();
    }
  },
};

let talkRuntime: {
  villagers: NamedNpc[];
  closeDialog: () => void;
  isTalking: () => boolean;
  talking: () => NamedNpc | null;
} | null = null;
let elapsed = 0;
