import './style.css';
import type { Feature, FeatureContext } from '../feature.ts';
import { addInteractable } from '../interact/index.ts';
import { grantItem } from '../pouch/index.ts';
import { addStarlight } from '../quests/index.ts';
import { loadFeatureData, saveFeatureData } from '../save.ts';
import { advanceOfflineDays } from '../clock.ts';
import * as THREE from 'three';

/**
 * るすばんの星(F19)。放置していた実時間ぶん、星の時間が進む。
 * 実1時間 = ゲーム内1日(最大7日)。留守の間に薬草や畑が育ち、
 * 家のポストに手紙と小さな贈り物が届いている。
 * 通知は出さない。「開いたら育っていた」の静かな喜びに留める。
 */

const VERSION = 1;
/** 実時間→ゲーム内日数の換算(ミリ秒/日) */
const MS_PER_DAY = 60 * 60 * 1000;
const MAX_OFFLINE_DAYS = 7;

const VISITORS = ['マルさん', 'トトさん', 'ロコじいさん', 'ハナさん', 'ネネばあ'];

interface IdleSave {
  lastSeen: number;
  /** ポストで受け取っていない留守の日数(0=なし) */
  pendingDays: number;
}

export const idleFeature: Feature = {
  id: 'idle',
  setup(ctx: FeatureContext): void {
    const now = Date.now();
    const saved = loadFeatureData<IdleSave>('idle', VERSION);
    let pendingDays = saved?.pendingDays ?? 0;
    const save = () =>
      saveFeatureData('idle', VERSION, { lastSeen: Date.now(), pendingDays });

    // 前回から経った実時間を、星の日数に変えて進める
    if (saved) {
      const offlineDays = Math.min(
        MAX_OFFLINE_DAYS,
        Math.floor((now - saved.lastSeen) / MS_PER_DAY)
      );
      if (offlineDays >= 1) {
        advanceOfflineDays(offlineDays, ctx.events);
        pendingDays = Math.min(MAX_OFFLINE_DAYS, pendingDays + offlineDays);
      }
    }
    save();
    // タブを閉じる直前にも時刻を残す
    window.addEventListener('pagehide', save);

    // --- ポスト(家の中)に手紙が届く ---
    const modal = document.createElement('div');
    modal.id = 'post-modal';
    document.body.appendChild(modal);
    const closeModal = () => modal.classList.remove('open');
    window.addEventListener('pointerdown', (event) => {
      if (!modal.classList.contains('open')) return;
      const target = event.target;
      if (target instanceof Node && modal.contains(target)) return;
      closeModal();
    });

    addInteractable({
      direction: new THREE.Vector3(0, 1, 0),
      position: new THREE.Vector3(1.6, 0, 3.7),
      space: 'interior',
      radius: 1.5,
      label: 'ポストを見る',
      priority: 6,
      enabled: () => pendingDays > 0,
      onUse: () => {
        const days = pendingDays;
        pendingDays = 0;
        const visitor = VISITORS[Math.floor(Math.random() * VISITORS.length)]!;
        const starlight = Math.min(days, 3);
        addStarlight(starlight);
        if (days >= 2) grantItem('seed_mix');
        save();

        modal.innerHTML = '';
        const title = document.createElement('div');
        title.className = 'post-title';
        title.textContent = '📮 ポストにはいっていた手紙';
        const body = document.createElement('p');
        body.className = 'post-text';
        body.textContent =
          `るすの間に、${visitor}が来てくれたみたい。` +
          `「またよるね」のメモと、星あかりが${starlight}つ。` +
          (days >= 2 ? 'それから、ふしぎな種がひと袋。' : '');
        const close = document.createElement('button');
        close.className = 'post-close';
        close.textContent = 'とじる';
        close.addEventListener('click', closeModal);
        modal.append(title, body, close);
        modal.classList.add('open');
      },
    });

    // 20秒ごとに「最後にいた時刻」を書いておく(急なタブ終了への保険)
    window.setInterval(save, 20000);
  },
};
