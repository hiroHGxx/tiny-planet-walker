import './style.css';
import type { Feature, FeatureContext } from '../feature.ts';
import { clearAllSaves } from '../save.ts';
import { isArriving } from '../planet-state.ts';

/**
 * タイトル画面(F16)。
 * 起動時に世界の上へ紙調のタイトルを重ね、「はじめる」で遊びに入る。
 * このクリックがブラウザの自動再生制限の解錠(AudioContext作成)を兼ねる
 * (audio.ts が window の pointerdown を拾うため、押すだけで音が始まる)。
 * 開いている間は移動キーを堰き止め、背景の星はゆっくり動き続ける。
 */

/** タイトルが堰き止めるキー(ゲーム操作のみ。F5やF12は通す) */
const BLOCKED_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyE',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

export const titleFeature: Feature = {
  id: 'title',
  setup(ctx: FeatureContext): void {
    // 気球で移動してきた直後はタイトルを出さない(planets側が到着演出を出す)
    if (isArriving()) return;
    const overlay = document.createElement('div');
    overlay.id = 'title-screen';

    const inner = document.createElement('div');
    inner.className = 'title-inner';

    const heading = document.createElement('h1');
    heading.className = 'title-heading';
    heading.textContent = '薬草の星';
    const subtitle = document.createElement('div');
    subtitle.className = 'title-subtitle';
    subtitle.textContent = '小さな星をあるく、薬師の箱庭';

    const start = document.createElement('button');
    start.id = 'title-start';
    start.textContent = 'はじめる';

    const reset = document.createElement('button');
    reset.id = 'title-reset';
    reset.textContent = 'はじめから(きろくを消す)';

    const hint = document.createElement('div');
    hint.className = 'title-hint';
    hint.textContent = 'WASD / 矢印キーで歩く・ドラッグで見わたす';

    inner.append(heading, subtitle, start, reset, hint);
    overlay.appendChild(inner);
    document.body.appendChild(overlay);

    // タイトルが開いている間、ゲーム操作のキーを堰き止める
    // (captureで main.ts のリスナーより先に受け取る)
    const blockKeys = (event: KeyboardEvent) => {
      if (BLOCKED_KEYS.has(event.code)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', blockKeys, { capture: true });

    start.addEventListener('click', () => {
      window.removeEventListener('keydown', blockKeys, { capture: true });
      overlay.classList.add('closing');
      // フェードアウトが終わったらDOMごと片付ける
      window.setTimeout(() => overlay.remove(), 700);
      ctx.events.emit('game-started', {});
    });

    // 「はじめから」は押しまちがい防止のため二段階にする
    let armed = false;
    reset.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        reset.textContent = 'ほんとうに消す?(もう一度押す)';
        reset.classList.add('armed');
        return;
      }
      clearAllSaves();
      location.reload();
    });
  },
};
