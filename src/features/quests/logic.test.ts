import { describe, expect, it } from 'vitest';
import { conversationFor, type QuestDef } from './logic.ts';
import { RECIPES, canCraft } from '../../content/recipes.ts';
import { CHAPTER1 } from '../../content/quests/chapter1.ts';
import { CHAPTER2 } from '../../content/quests/chapter2.ts';
import { CHAPTER3 } from '../../content/quests/chapter3.ts';
import { ITEMS } from '../../content/items.ts';

const DEFS: QuestDef[] = [
  {
    id: 'q1',
    giver: 'maru',
    title: 'まるば草を3株',
    intro: ['たのむよ'],
    accept: 'ありがとう',
    reminder: 'まだかい?',
    thanks: ['たすかった'],
    need: { item: 'roundleaf', count: 3 },
    starlight: 1,
  },
  {
    id: 'q2',
    giver: 'maru',
    after: 'q1',
    title: 'お茶をひとつ',
    intro: ['お茶をたのむ'],
    accept: 'うれしいね',
    reminder: 'お茶まだかい?',
    thanks: ['いい香りだ'],
    need: { item: 'tea_starflower', count: 1 },
    starlight: 2,
  },
];

describe('依頼の会話判断', () => {
  it('未受注なら最初の依頼を提案する', () => {
    const result = conversationFor(DEFS, { accepted: [], completed: [] }, 'maru', () => 0);
    expect(result).toMatchObject({ kind: 'offer', quest: { id: 'q1' } });
  });

  it('受注中で材料が足りなければ催促、足りれば納品になる', () => {
    const progress = { accepted: ['q1'], completed: [] };
    expect(conversationFor(DEFS, progress, 'maru', () => 2).kind).toBe('reminder');
    expect(conversationFor(DEFS, progress, 'maru', () => 3).kind).toBe('deliver');
  });

  it('チェーンの次の依頼は前を終えるまで提案されない', () => {
    const done1 = { accepted: ['q1'], completed: ['q1'] };
    expect(conversationFor(DEFS, done1, 'maru', () => 0)).toMatchObject({
      kind: 'offer',
      quest: { id: 'q2' },
    });
    const allDone = { accepted: ['q1', 'q2'], completed: ['q1', 'q2'] };
    expect(conversationFor(DEFS, allDone, 'maru', () => 9).kind).toBe('smalltalk');
  });

  it('別の村人には自分の依頼しか出ない', () => {
    expect(conversationFor(DEFS, { accepted: [], completed: [] }, 'toto', () => 0).kind).toBe(
      'smalltalk'
    );
  });
});

describe('コンテンツの整合性', () => {
  const itemIds = new Set(ITEMS.map((item) => item.id));

  it('全章の納品物はすべてアイテム台帳にある', () => {
    for (const quest of [...CHAPTER1, ...CHAPTER2, ...CHAPTER3]) {
      expect(itemIds.has(quest.need.item), `${quest.id}の${quest.need.item}`).toBe(true);
      if (quest.after) {
        expect([...CHAPTER1, ...CHAPTER2, ...CHAPTER3].some((q) => q.id === quest.after), `${quest.id}のafter`).toBe(true);
      }
    }
  });

  it('レシピの成果物と材料はすべてアイテム台帳にある', () => {
    for (const recipe of RECIPES) {
      expect(itemIds.has(recipe.result)).toBe(true);
      for (const need of recipe.needs) expect(itemIds.has(need.item)).toBe(true);
    }
  });

  it('材料がそろっているときだけ調合できる', () => {
    const recipe = RECIPES[0]!; // ほしばなのお茶(ほしばな2)
    expect(canCraft(recipe, () => 0)).toBe(false);
    expect(canCraft(recipe, () => 2)).toBe(true);
  });
});
