/**
 * 依頼の純粋ロジック(DOM・THREEに依存しない。テストしやすくするため分離)。
 * 「この村人に話しかけたとき、どの会話になるか」をここで決める。
 */

export interface QuestDef {
  id: string;
  /** 依頼主(content/npcs.ts のID) */
  giver: string;
  /** HUDの依頼メモに出す一文 */
  title: string;
  /** 受ける前の会話 */
  intro: ReadonlyArray<string>;
  /** 「うける」を選んだときのひとこと */
  accept: string;
  /** 進行中に話しかけたときのひとこと */
  reminder: string;
  /** 納品したときの会話 */
  thanks: ReadonlyArray<string>;
  /** 納品物(items.tsのIDと数) */
  need: { item: string; count: number };
  /** お礼にもらえる星あかりの数 */
  starlight: number;
  /** この依頼IDを終えていないと始まらない(チェーン) */
  after?: string;
}

export interface QuestProgress {
  accepted: string[];
  completed: string[];
}

export type GiverConversation =
  | { kind: 'deliver'; quest: QuestDef }
  | { kind: 'reminder'; quest: QuestDef }
  | { kind: 'offer'; quest: QuestDef }
  | { kind: 'smalltalk' };

/**
 * 村人に話しかけたときの会話の種類を決める。
 * 優先順:納品できる依頼 > 進行中の依頼の催促 > 新しい依頼の提案 > 世間話
 */
export function conversationFor(
  defs: ReadonlyArray<QuestDef>,
  progress: QuestProgress,
  giverId: string,
  countOf: (item: string) => number
): GiverConversation {
  const giverQuests = defs.filter((quest) => quest.giver === giverId);

  const active = giverQuests.find(
    (quest) =>
      progress.accepted.includes(quest.id) && !progress.completed.includes(quest.id)
  );
  if (active) {
    return countOf(active.need.item) >= active.need.count
      ? { kind: 'deliver', quest: active }
      : { kind: 'reminder', quest: active };
  }

  const available = giverQuests.find(
    (quest) =>
      !progress.accepted.includes(quest.id) &&
      !progress.completed.includes(quest.id) &&
      (!quest.after || progress.completed.includes(quest.after))
  );
  if (available) return { kind: 'offer', quest: available };

  return { kind: 'smalltalk' };
}
