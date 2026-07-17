import * as THREE from 'three';
import { PLANET_RADIUS } from './palette.ts';

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
}

/** 図鑑に載る薬草の種類(idはworld.tsのファクトリ対応表と揃える) */
export const HERB_SPECIES: ReadonlyArray<{ id: string; name: string; note: string }> = [
  {
    id: 'roundleaf',
    name: 'まるば草',
    note: '丸い葉の薬草。すりつぶすと傷薬になる、薬屋の基本のき。',
  },
  {
    id: 'starflower',
    name: 'ほしばな',
    note: '星のかたちに咲く花。乾かしてお茶にすると熱をやわらげる。',
  },
  {
    id: 'glow',
    name: 'ひかり草',
    note: '夜にほんのり光るふしぎな草。まわりに小さな光の粒が漂う。',
  },
  {
    id: 'berry',
    name: 'すずなり草',
    note: '細い茎の先に丸い実がつく。甘い実はせき止めシロップの材料。',
  },
  {
    id: 'smallflower',
    name: 'のばな',
    note: '白と黄色の小さな花。薬の苦味をやわらげる香りづけに使う。',
  },
  {
    id: 'rosette',
    name: 'ねざし草',
    note: '地面にぴったりと葉を広げる。根を煎じるとおなかの薬になる。',
  },
  {
    id: 'bud',
    name: 'つぼみ草',
    note: 'ずっとつぼみのままの草。しずくのなかに朝露をためている。',
  },
];

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

export function createJournal(sightings: readonly HerbSighting[]): Journal {
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

  const refresh = () => {
    button.textContent = `📖 ${discovered.size}/${HERB_SPECIES.length}`;
    panel.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'journal-title';
    title.textContent = `薬草図鑑 ${discovered.size}/${HERB_SPECIES.length}`;
    panel.appendChild(title);
    for (const species of HERB_SPECIES) {
      const found = discovered.has(species.id);
      const row = document.createElement('div');
      row.className = found ? 'journal-row' : 'journal-row undiscovered';
      const name = document.createElement('div');
      name.className = 'journal-name';
      name.textContent = found ? species.name : '?????';
      const note = document.createElement('div');
      note.className = 'journal-note';
      note.textContent = found
        ? species.note
        : 'まだ見つけていない。星のどこかに生えている。';
      row.append(name, note);
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
