import * as THREE from 'three';

/**
 * 手紙の断片(F11)。「前の薬師さん」の日記が星のあちこちに落ちている。
 * 全部読むと、おえんちゃんがこの星に来た理由がそっとつながる。
 */

export interface LetterDef {
  id: string;
  /** 落ちている場所(単位ベクトル) */
  direction: THREE.Vector3;
  title: string;
  text: ReadonlyArray<string>;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();

export const LETTERS: ReadonlyArray<LetterDef> = [
  {
    id: 'letter1',
    direction: v(0.32, 0.94, 0.14),
    title: 'はじまりの頁',
    text: [
      '春。この星に薬屋をひらいて、はじめての朝。',
      '窓をあけたら、まるば草のにおいがした。ここでやっていける気がする。',
    ],
  },
  {
    id: 'letter2',
    direction: v(-0.6, 0.42, 0.68),
    title: 'パンの頁',
    text: [
      'パン屋のマルさんが、焼きたてをひとつ置いていってくれた。',
      '薬代のかわりだって。この星の人は、みんなこうだ。',
    ],
  },
  {
    id: 'letter3',
    direction: v(0.55, 0.5, -0.68),
    title: '湖の頁',
    text: [
      'ロコじいさんの腰の薬を届けに、湖まで歩いた。',
      '帰りみち、水面に星がうつっていた。二つの空にはさまれて歩いた。',
    ],
  },
  {
    id: 'letter4',
    direction: v(-0.45, -0.2, -0.87),
    title: '雨の頁',
    text: [
      '今日は一日、雨。誰も来ない。',
      'こういう日は薬草を干して、窓の雨音を聞く。それも仕事のうち。',
    ],
  },
  {
    id: 'letter5',
    direction: v(0.1, -0.9, 0.42),
    title: '裏側の頁',
    text: [
      '星の裏側の村まで往診。歩いても歩いても、空がついてくる。',
      'この星は小さい。でも、困っている人がいれば、どこへでも行く。',
    ],
  },
  {
    id: 'letter6',
    direction: v(-0.88, -0.3, 0.36),
    title: 'ひかり草の頁',
    text: [
      '夜、ひかり草の群生地で足を止めた。',
      '薬にもなるが、こうして眺めるだけでも、ずいぶん効く気がする。',
    ],
  },
  {
    id: 'letter7',
    direction: v(0.75, -0.5, -0.43),
    title: '種の頁',
    text: [
      'よその星から、ふしぎな種が届いた。まいてみようと思う。',
      '薬草は、どこの星でも薬草だ。それがうれしい。',
    ],
  },
  {
    id: 'letter8',
    direction: v(-0.2, 0.7, -0.69),
    title: 'たびだちの頁',
    text: [
      'この星の薬箱は、もういっぱいになった。次の星が呼んでいる。',
      'あとを継いでくれる誰かへ。——この星を、どうかよろしく。',
      'それから、気球はいいぞ。星あかりが十分たまったら、乗ってみるといい。',
    ],
  },
];
