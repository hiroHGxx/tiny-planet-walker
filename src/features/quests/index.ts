import './style.css';
import type { Feature, FeatureContext } from '../feature.ts';
import { loadFeatureData, saveFeatureData } from '../save.ts';
import { getItemCount, consumeItems } from '../pouch/index.ts';
import {
  conversationFor,
  type GiverConversation,
  type QuestDef,
  type QuestProgress,
} from './logic.ts';

/**
 * 依頼(F6)の状態管理とHUDの依頼メモ。
 * 依頼の定義は content/quests/ に章ごとに置き、dynamic importで遅延読み込みする。
 * 会話の進行そのもの(窓の表示)は talk 機能が担い、
 * ここは「どの会話になるか」の判断と、受注・納品の記録を持つ。
 * ※talk機能から直接importされる土台。報酬の星あかりもここで数える。
 */

const VERSION = 1;

interface QuestSave extends QuestProgress {
  starlight: number;
}

let defs: QuestDef[] = [];
let progress: QuestSave = { accepted: [], completed: [], starlight: 0 };
let tracker: HTMLDivElement | null = null;
let starlightChip: HTMLDivElement | null = null;
let celebrateEl: HTMLDivElement | null = null;
let celebrateTimer = 0;
let eventsRef: import('../events.ts').EventBus | null = null;

/** HUDの✨表示を書き直し、増えた瞬間はぽんと弾ませる */
function refreshStarlight(bump: boolean): void {
  if (!starlightChip) return;
  starlightChip.textContent = `✨ ${progress.starlight}`;
  if (bump) {
    starlightChip.classList.remove('bump');
    void starlightChip.offsetWidth; // アニメーションを最初から再生し直す
    starlightChip.classList.add('bump');
  }
}

/** 達成のお祝いトースト(依頼・お手伝いの完了で使う) */
export function celebrate(text: string): void {
  if (!celebrateEl) return;
  celebrateEl.textContent = text;
  celebrateEl.classList.remove('show');
  void celebrateEl.offsetWidth;
  celebrateEl.classList.add('show');
  window.clearTimeout(celebrateTimer);
  celebrateTimer = window.setTimeout(() => celebrateEl?.classList.remove('show'), 3000);
}

const save = () => saveFeatureData('quests', VERSION, progress);

/** 村人に話しかけたときの会話の種類(talk機能が使う) */
export function questConversation(giverId: string): GiverConversation {
  return conversationFor(defs, progress, giverId, getItemCount);
}

/** 依頼を受ける(talk機能が「うける」で呼ぶ) */
export function acceptQuest(quest: QuestDef): void {
  if (!progress.accepted.includes(quest.id)) progress.accepted.push(quest.id);
  save();
  refreshTracker();
}

/** 納品して依頼を果たす。材料が足りなければfalse(talk機能が呼ぶ) */
export function completeQuest(quest: QuestDef): boolean {
  if (!consumeItems([quest.need])) return false;
  if (!progress.completed.includes(quest.id)) progress.completed.push(quest.id);
  progress.starlight += quest.starlight;
  save();
  refreshTracker();
  refreshStarlight(true);
  celebrate(`依頼をはたした! ✨星あかり +${quest.starlight}`);
  eventsRef?.emit('starlight-changed', { count: progress.starlight });
  return true;
}

/** これまでに集めた星あかりの数(F20「次の星へ」が使う) */
export function starlightCount(): number {
  return progress.starlight;
}

/** 星あかりを直接足す(掲示板のお手伝い・ポストの贈り物など) */
export function addStarlight(count: number): void {
  progress.starlight += count;
  save();
  refreshStarlight(true);
  eventsRef?.emit('starlight-changed', { count: progress.starlight });
}

/** HUD左下の依頼メモを書き直す */
function refreshTracker(): void {
  if (!tracker) return;
  tracker.innerHTML = '';
  const active = defs.filter(
    (quest) =>
      progress.accepted.includes(quest.id) && !progress.completed.includes(quest.id)
  );
  if (active.length === 0) {
    tracker.classList.remove('show');
    return;
  }
  tracker.classList.add('show');
  for (const quest of active) {
    const row = document.createElement('div');
    row.className = 'quest-row';
    const done = getItemCount(quest.need.item) >= quest.need.count;
    row.textContent = `${done ? '✅' : '🌿'} ${quest.title}`;
    if (done) row.classList.add('done');
    tracker.appendChild(row);
  }
}

export const questsFeature: Feature = {
  id: 'quests',
  setup(ctx: FeatureContext): void {
    const saved = loadFeatureData<QuestSave>('quests', VERSION);
    if (saved) progress = saved;

    eventsRef = ctx.events;
    tracker = document.createElement('div');
    tracker.id = 'quest-tracker';
    document.body.appendChild(tracker);

    // HUD右上の星あかり(報酬の貯まりが常に見える。気球の旅に使う)
    starlightChip = document.createElement('div');
    starlightChip.id = 'starlight-chip';
    starlightChip.className = 'hud-chip';
    starlightChip.title = '星あかり — 気球の旅に使う';
    (document.querySelector('#hud-buttons') ?? document.body).appendChild(starlightChip);
    refreshStarlight(false);

    // 達成のお祝いトースト
    celebrateEl = document.createElement('div');
    celebrateEl.id = 'quest-celebrate';
    document.body.appendChild(celebrateEl);

    // 依頼の定義は章ごとに遅延読み込み(まとめて読まない行儀。設計書§6)
    void Promise.all([
      import('../../content/quests/chapter1.ts'),
      import('../../content/quests/chapter2.ts'),
      import('../../content/quests/chapter3.ts'),
      import('../../content/quests/chapter4.ts'),
    ]).then(([chapter1, chapter2, chapter3, chapter4]) => {
      defs = [
        ...chapter1.CHAPTER1,
        ...chapter2.CHAPTER2,
        ...chapter3.CHAPTER3,
        ...chapter4.CHAPTER4,
      ];
      refreshTracker();
    });

    // 摘む・調合・納品でメモの✅が変わる
    ctx.events.on('item-changed', refreshTracker);
    ctx.events.on('quest-started', refreshTracker);
  },
};
