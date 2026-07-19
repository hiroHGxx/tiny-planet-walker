import * as THREE from 'three';
import { PLANET_RADIUS } from './palette.ts';
import type { EventBus } from './features/events.ts';

/**
 * 薬草図鑑。
 * 星に生えている薬草に近づくと、その種類を「見つけた」ことになり、
 * 右上の図鑑ボタンから開くページに記録される。
 * スコアや報酬はなく、ただページが静かに埋まっていくだけのコレクション。
 * 見つけた種類はlocalStorageに保存され、次に遊ぶときも引き継がれる。
 */

export interface HerbSighting {
  /** 株が生えている方向(単位ベクトル) */
  direction: THREE.Vector3;
  /** 種類ID(HERB_SPECIES の id) */
  species: string;
  /** 株の3Dオブジェクト(摘む演出に使う。テストでは省略可) */
  mesh?: THREE.Group;
}

// 薬草の名前・説明・挿絵は content/herbs.ts の台帳に集約した。
// 既存の参照元(items.ts・garden・テスト)のために、従来の形でここからも提供する
import { HERBS } from './content/herbs.ts';

/** 図鑑に載る薬草の種類(台帳から派生) */
export const HERB_SPECIES: ReadonlyArray<{ id: string; name: string; note: string }> =
  HERBS.map(({ id, name, note }) => ({ id, name, note }));

/** 図鑑の挿絵(種類ID→インラインSVG。台帳から派生) */
export const HERB_ICONS: Readonly<Record<string, string>> = Object.fromEntries(
  HERBS.map((herb) => [herb.id, herb.icon])
);

const STORAGE_KEY = 'tiny-planet-walker:journal';
/** この表面距離まで近づいたら「見つけた」ことにする */
const DISCOVER_DISTANCE = 1.7;
/** 発見のお知らせを出しておく時間(秒) */
const TOAST_DURATION = 3;

export interface Journal {
  update(deltaTime: number, playerDirection: THREE.Vector3): void;
  /** 見つけた種類の数(テストからも使う) */
  discoveredCount(): number;
}

export function createJournal(sightings: readonly HerbSighting[], events?: EventBus): Journal {
  const discovered = new Set<string>(loadDiscovered());
  // まだ見つけていない種類の株だけを残し、毎フレームの判定を軽くする
  let pending = sightings.filter((sighting) => !discovered.has(sighting.species));
  const minDot = Math.cos(DISCOVER_DISTANCE / PLANET_RADIUS);

  // --- 図鑑ボタンとパネル ---
  const host = document.querySelector('#hud-buttons') ?? document.body;
  const button = document.createElement('button');
  button.className = 'hud-button';
  button.id = 'journal-toggle';
  button.title = '薬草図鑑';
  host.appendChild(button);

  const panel = document.createElement('div');
  panel.id = 'journal-panel';
  document.body.appendChild(panel);
  button.addEventListener('click', () => panel.classList.toggle('open'));

  // パネルの外(ゲーム画面など)をクリック/タップしたら図鑑を閉じる
  window.addEventListener('pointerdown', (event) => {
    if (!panel.classList.contains('open')) return;
    const target = event.target;
    if (target instanceof Node && (panel.contains(target) || button.contains(target))) return;
    panel.classList.remove('open');
  });

  const refresh = () => {
    button.textContent = `📖 ${discovered.size}/${HERB_SPECIES.length}`;
    panel.innerHTML = '';

    // 見出し:タイトル・見つけた数・進み具合のバー
    const header = document.createElement('div');
    header.className = 'journal-header';
    const title = document.createElement('div');
    title.className = 'journal-title';
    title.textContent = '薬草図鑑';
    const count = document.createElement('div');
    count.className = 'journal-count';
    count.textContent = `${discovered.size} / ${HERB_SPECIES.length}`;
    header.append(title, count);
    const progress = document.createElement('div');
    progress.className = 'journal-progress';
    const fill = document.createElement('div');
    fill.className = 'journal-progress-fill';
    fill.style.width = `${(discovered.size / HERB_SPECIES.length) * 100}%`;
    progress.appendChild(fill);
    panel.append(header, progress);

    for (const species of HERB_SPECIES) {
      const found = discovered.has(species.id);
      const row = document.createElement('div');
      row.className = found ? 'journal-row' : 'journal-row undiscovered';
      const icon = document.createElement('div');
      icon.className = 'journal-icon';
      icon.innerHTML = HERB_ICONS[species.id] ?? '';
      const text = document.createElement('div');
      text.className = 'journal-text';
      const name = document.createElement('div');
      name.className = 'journal-name';
      name.textContent = found ? species.name : '?????';
      const note = document.createElement('div');
      note.className = 'journal-note';
      note.textContent = found
        ? species.note
        : 'まだ見つけていない。星のどこかに生えている。';
      text.append(name, note);
      row.append(icon, text);
      panel.appendChild(row);
    }
  };
  refresh();

  // --- 発見のお知らせ(トースト) ---
  const toast = document.createElement('div');
  toast.id = 'journal-toast';
  document.body.appendChild(toast);
  const toastQueue: string[] = [];
  let toastPhase: 'hidden' | 'showing' | 'fading' = 'hidden';
  let toastTimer = 0;

  return {
    update(deltaTime: number, playerDirection: THREE.Vector3): void {
      // 近くにある未発見の薬草を探す(1フレームに見つかるのは1種類まで)
      for (const sighting of pending) {
        if (sighting.direction.dot(playerDirection) <= minDot) continue;
        discovered.add(sighting.species);
        saveDiscovered(discovered);
        const species = HERB_SPECIES.find((entry) => entry.id === sighting.species);
        if (species) toastQueue.push(`「${species.name}」を見つけた! 図鑑に記録した`);
        events?.emit('herb-discovered', { species: sighting.species });
        // 同じ種類の株はもう判定しなくてよい
        pending = pending.filter((entry) => entry.species !== sighting.species);
        refresh();
        break;
      }

      // トーストは「表示 → フェード → 少し間を置いて次」の順に出す
      toastTimer -= deltaTime;
      if (toastPhase === 'showing' && toastTimer <= 0) {
        toast.classList.remove('show');
        toastPhase = 'fading';
        toastTimer = 0.45;
      } else if (toastPhase === 'fading' && toastTimer <= 0) {
        toastPhase = 'hidden';
      }
      if (toastPhase === 'hidden' && toastQueue.length > 0) {
        toast.textContent = toastQueue.shift()!;
        toast.classList.add('show');
        toastPhase = 'showing';
        toastTimer = TOAST_DURATION;
      }
    },
    discoveredCount: () => discovered.size,
  };
}

function loadDiscovered(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return []; // 保存が使えない環境では、その回かぎりの図鑑になる
  }
}

function saveDiscovered(discovered: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...discovered]));
  } catch {
    // 保存できなくても遊べるので何もしない
  }
}
