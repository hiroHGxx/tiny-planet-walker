import './style.css';
import * as THREE from 'three';
import { PALETTE, toonMaterial, flatGeometry } from '../../palette.ts';
import { PLANET_RADIUS } from '../../world.ts';
import { LETTERS } from '../../content/letters.ts';
import type { Feature, FeatureContext } from '../feature.ts';
import { addInteractable } from '../interact/index.ts';
import { loadFeatureData, saveFeatureData } from '../save.ts';

/**
 * 手紙の断片(F11)。星のあちこちに光る紙片が落ちていて、「E 拾う」で読める。
 * 拾った手紙はHUDの✉️ボタンからいつでも読み返せる。
 * 全部そろうと、前の薬師さんの物語がひとつにつながる。
 */

const VERSION = 1;
const PICK_DISTANCE = 1.6;

export const lettersFeature: Feature = {
  id: 'letters',
  setup(ctx: FeatureContext): void {
    const saved = loadFeatureData<{ found: string[] }>('letters', VERSION);
    const found = new Set(saved?.found ?? []);
    const save = () => saveFeatureData('letters', VERSION, { found: [...found] });

    // --- 光る紙片を置く ---
    const props = new Map<string, THREE.Group>();
    for (const letter of LETTERS) {
      const prop = new THREE.Group();
      const paper = new THREE.Mesh(
        flatGeometry(new THREE.BoxGeometry(0.34, 0.02, 0.26)),
        toonMaterial(PALETTE.petal, 0x555030)
      );
      paper.rotation.y = Math.random() * Math.PI;
      prop.add(paper);
      prop.position.copy(letter.direction).multiplyScalar(PLANET_RADIUS + 0.12);
      prop.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), letter.direction);
      prop.visible = !found.has(letter.id);
      ctx.scene.add(prop);
      props.set(letter.id, prop);
    }

    // --- 読む用のモーダルとHUDボタン ---
    const modal = document.createElement('div');
    modal.id = 'letter-modal';
    document.body.appendChild(modal);
    const closeModal = () => modal.classList.remove('open');
    window.addEventListener('pointerdown', (event) => {
      if (!modal.classList.contains('open')) return;
      const target = event.target;
      if (target instanceof Node && modal.contains(target)) return;
      closeModal();
    });

    const readLetter = (letterId: string) => {
      const letter = LETTERS.find((entry) => entry.id === letterId);
      if (!letter) return;
      modal.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'letter-title';
      title.textContent = `📜 ${letter.title}`;
      modal.appendChild(title);
      for (const paragraph of letter.text) {
        const p = document.createElement('p');
        p.className = 'letter-text';
        p.textContent = paragraph;
        modal.appendChild(p);
      }
      if (found.size === LETTERS.length) {
        const complete = document.createElement('p');
        complete.className = 'letter-complete';
        complete.textContent = '——8枚の頁が、そろった。';
        modal.appendChild(complete);
      }
      const close = document.createElement('button');
      close.className = 'letter-close';
      close.textContent = 'とじる';
      close.addEventListener('click', closeModal);
      modal.appendChild(close);
      modal.classList.add('open');
    };

    const host = document.querySelector('#hud-buttons') ?? document.body;
    const button = document.createElement('button');
    button.className = 'hud-button';
    button.id = 'letters-toggle';
    button.title = '手紙の頁';
    host.appendChild(button);
    const refreshButton = () => {
      button.textContent = `✉️ ${found.size}/${LETTERS.length}`;
    };
    refreshButton();

    const panel = document.createElement('div');
    panel.id = 'letters-panel';
    document.body.appendChild(panel);
    const refreshPanel = () => {
      panel.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'letters-title';
      title.textContent = '手紙の頁';
      panel.appendChild(title);
      for (const letter of LETTERS) {
        const row = document.createElement('div');
        const has = found.has(letter.id);
        row.className = has ? 'letters-row' : 'letters-row missing';
        row.textContent = has ? `📜 ${letter.title}` : '📃 ?????';
        if (has) row.addEventListener('click', () => readLetter(letter.id));
        panel.appendChild(row);
      }
    };
    refreshPanel();
    button.addEventListener('click', () => panel.classList.toggle('open'));
    window.addEventListener('pointerdown', (event) => {
      if (!panel.classList.contains('open')) return;
      const target = event.target;
      if (target instanceof Node && (panel.contains(target) || button.contains(target))) return;
      panel.classList.remove('open');
    });

    // --- 拾う ---
    for (const letter of LETTERS) {
      addInteractable({
        direction: letter.direction,
        radius: PICK_DISTANCE,
        label: '手紙を拾う',
        priority: 6,
        enabled: () => !found.has(letter.id),
        onUse: () => {
          found.add(letter.id);
          save();
          props.get(letter.id)!.visible = false;
          refreshButton();
          refreshPanel();
          ctx.events.emit('letter-found', { letterId: letter.id });
          readLetter(letter.id);
        },
      });
    }
  },
};
