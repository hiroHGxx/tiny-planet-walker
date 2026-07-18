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

/**
 * 図鑑の挿絵(種類ごとの小さなSVG)。
 * 画像ファイルは使わず、星に生えている株の姿をコードで描き起こす。
 * 色は palette.ts の植物色(茎・葉・花びら・実)に合わせている。
 */
export const HERB_ICONS: Readonly<Record<string, string>> = {
  roundleaf: `<svg viewBox="0 0 40 40">
    <path d="M20 36 V12 M20 30 Q14 27 10 22 M20 26 Q26 24 30 20" fill="none" stroke="#4c7a3d" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="20" cy="9" r="5.5" fill="#79ad63"/>
    <circle cx="9" cy="19" r="4.5" fill="#54793f"/>
    <circle cx="31" cy="17" r="4.5" fill="#79ad63"/>
  </svg>`,
  starflower: `<svg viewBox="0 0 40 40">
    <path d="M20 36 V18" fill="none" stroke="#4c7a3d" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M20 33 Q14 31 12 26" fill="none" stroke="#4c7a3d" stroke-width="2" stroke-linecap="round"/>
    <g fill="#f5efd7">
      <ellipse cx="20" cy="7" rx="3" ry="6.5" transform="rotate(0 20 13)"/>
      <ellipse cx="20" cy="7" rx="3" ry="6.5" transform="rotate(72 20 13)"/>
      <ellipse cx="20" cy="7" rx="3" ry="6.5" transform="rotate(144 20 13)"/>
      <ellipse cx="20" cy="7" rx="3" ry="6.5" transform="rotate(216 20 13)"/>
      <ellipse cx="20" cy="7" rx="3" ry="6.5" transform="rotate(288 20 13)"/>
    </g>
    <circle cx="20" cy="13" r="3.4" fill="#e8c94f"/>
  </svg>`,
  glow: `<svg viewBox="0 0 40 40">
    <path d="M20 36 Q19 24 20 16" fill="none" stroke="#4c7a3d" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="20" cy="12" r="9" fill="#d9ef7c" opacity="0.25"/>
    <circle cx="20" cy="12" r="5" fill="#d9ef7c"/>
    <circle cx="8" cy="8" r="1.3" fill="#d9ef7c" opacity="0.8"/>
    <circle cx="32" cy="15" r="1.3" fill="#d9ef7c" opacity="0.8"/>
    <circle cx="29" cy="5" r="1" fill="#d9ef7c" opacity="0.6"/>
  </svg>`,
  berry: `<svg viewBox="0 0 40 40">
    <path d="M18 36 Q16 20 22 10 M22 10 Q26 8 30 10 M22 10 Q22 6 25 4" fill="none" stroke="#4c7a3d" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="31" cy="13" r="3.6" fill="#e8c94f"/>
    <circle cx="26" cy="6" r="3.2" fill="#d9ef7c"/>
    <circle cx="18" cy="14" r="3" fill="#e8c94f"/>
    <path d="M18 30 Q12 28 9 23" fill="none" stroke="#54793f" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  smallflower: `<svg viewBox="0 0 40 40">
    <path d="M14 36 Q13 26 13 20 M26 36 Q27 28 27 23" fill="none" stroke="#4c7a3d" stroke-width="2.2" stroke-linecap="round"/>
    <g fill="#f5efd7">
      <circle cx="13" cy="12" r="2.6"/><circle cx="9" cy="16" r="2.6"/><circle cx="17" cy="16" r="2.6"/>
      <circle cx="10" cy="20" r="2.6"/><circle cx="16" cy="20" r="2.6"/>
    </g>
    <circle cx="13" cy="16.5" r="2.4" fill="#e8c94f"/>
    <g fill="#f5efd7">
      <circle cx="27" cy="16" r="2.2"/><circle cx="24" cy="19" r="2.2"/><circle cx="30" cy="19" r="2.2"/>
      <circle cx="25" cy="22.5" r="2.2"/><circle cx="29" cy="22.5" r="2.2"/>
    </g>
    <circle cx="27" cy="19.5" r="2" fill="#e8c94f"/>
  </svg>`,
  rosette: `<svg viewBox="0 0 40 40">
    <g>
      <ellipse cx="20" cy="24" rx="3.2" ry="8" transform="rotate(-70 20 31)" fill="#54793f"/>
      <ellipse cx="20" cy="23" rx="3.2" ry="8.5" transform="rotate(-35 20 31)" fill="#79ad63"/>
      <ellipse cx="20" cy="22" rx="3.4" ry="9" fill="#54793f"/>
      <ellipse cx="20" cy="23" rx="3.2" ry="8.5" transform="rotate(35 20 31)" fill="#79ad63"/>
      <ellipse cx="20" cy="24" rx="3.2" ry="8" transform="rotate(70 20 31)" fill="#54793f"/>
    </g>
    <circle cx="20" cy="30" r="3" fill="#79ad63"/>
  </svg>`,
  bud: `<svg viewBox="0 0 40 40">
    <path d="M20 36 V22 M20 30 Q15 28 12 24" fill="none" stroke="#4c7a3d" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M20 6 C13.5 14 14 20 20 22 C26 20 26.5 14 20 6 Z" fill="#d9ef7c"/>
    <circle cx="17.5" cy="13" r="1.6" fill="#f5efd7" opacity="0.9"/>
  </svg>`,
};

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
