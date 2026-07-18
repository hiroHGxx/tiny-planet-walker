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
  return true;
}

/** これまでに集めた星あかりの数(いずれF20「次の星へ」が使う) */
export function starlightCount(): number {
  return progress.starlight;
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

    tracker = document.createElement('div');
    tracker.id = 'quest-tracker';
    document.body.appendChild(tracker);

    // 依頼の定義は章ごとに遅延読み込み(まとめて読まない行儀。設計書§6)
    void import('../../content/quests/chapter1.ts').then((chapter) => {
      defs = [...chapter.CHAPTER1];
      refreshTracker();
    });

    // 摘む・調合・納品でメモの✅が変わる
    ctx.events.on('item-changed', refreshTracker);
    ctx.events.on('quest-started', refreshTracker);
  },
};
