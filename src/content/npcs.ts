import * as THREE from 'three';
import { VILLAGE_CENTERS, PASTURES, FLOWER_FIELDS, LAKES, OEN_JUNCTION } from '../world.ts';
import { moveToward } from '../town.ts';

/**
 * 名前つき村人の台帳。
 * 既存の村人20人とは別に、ここに書いた10人が talk 機能によって星に増える。
 * 話しかけると名前と肩書きが出て、依頼(quests)の窓口にもなる。
 * セリフ・配置を変えるのはこのファイルだけでよい。
 */

export interface NamedNpcDef {
  id: string;
  name: string;
  /** 会話窓の名前の横に出す肩書き */
  title: string;
  /** 住んでいる場所(単位ベクトル) */
  home: THREE.Vector3;
  /** 外見の乱数シード(変えると服・帽子・体型が変わる) */
  seed: number;
  /** 依頼がないときの世間話(ランダムに1つ) */
  smalltalk: ReadonlyArray<string>;
}

/** 方向ベクトルを少しだけずらす(村の中心そのものに立たせないため) */
function offset(base: THREE.Vector3, dx: number, dy: number, dz: number): THREE.Vector3 {
  return base.clone().add(new THREE.Vector3(dx, dy, dz)).normalize();
}

export const NAMED_NPCS: ReadonlyArray<NamedNpcDef> = [
  {
    id: 'maru',
    name: 'マルさん',
    title: 'パン屋',
    home: offset(VILLAGE_CENTERS[1]!, 0.04, 0.05, -0.03),
    seed: 101,
    smalltalk: [
      '今日のパンは、まるば草を練りこんでみたんだ',
      '窯の火加減はね、空の色で決めるのさ',
      'おえんちゃんの薬は、うちのパンとよく合うよ',
    ],
  },
  {
    id: 'toto',
    name: 'トトさん',
    title: 'ひつじ番',
    home: offset(PASTURES[0]!, 0.03, -0.02, 0.04),
    seed: 102,
    smalltalk: [
      'ひつじはね、雲のにおいがするんだよ',
      'この子たちの毛は、星いちばんのふわふわさ',
      '夜になると、ひつじも星を見てるんだ',
    ],
  },
  {
    id: 'roko',
    name: 'ロコじいさん',
    title: '釣り好き',
    home: moveToward(LAKES[0]!.direction.clone(), VILLAGE_CENTERS[1]!, 0.2),
    seed: 103,
    smalltalk: [
      '釣れるかって? 釣りはな、待つのが楽しいんじゃよ',
      '湖の底には星が沈んどる…ような気がするんじゃ',
      '腰の具合はまあまあ。おえんちゃんの薬のおかげじゃな',
    ],
  },
  {
    id: 'hana',
    name: 'ハナさん',
    title: '花好き',
    home: offset(FLOWER_FIELDS[0]!, 0.05, -0.03, 0.02),
    seed: 104,
    smalltalk: [
      'お花はね、話しかけるとよく育つの',
      'のばなの香りは、朝がいちばん濃いのよ',
      '花かんむり、こんど編んであげるわね',
    ],
  },
  {
    id: 'popo',
    name: 'ポポ',
    title: 'むらのこども',
    home: offset(VILLAGE_CENTERS[0]!, -0.04, 0.03, 0.05),
    seed: 105,
    smalltalk: [
      'ねえねえ、星のうらがわって行ったことある?',
      'きのう、ちょうちょを10ぴき数えたんだ!',
      'おおきくなったら、ぼくも薬師になるんだ',
    ],
  },
  {
    id: 'sage',
    name: 'セージさん',
    title: 'ものしり',
    home: offset(OEN_JUNCTION, 0.05, 0.04, -0.04),
    seed: 106,
    smalltalk: [
      'この星は、歩いて一周できる。それがどれだけ幸せなことか',
      '昔はこの道も、ただの草はらだったのだよ',
      'ひかり草が光るのは、月に恋をしているからだ…と言われておる',
    ],
  },
  {
    id: 'mimi',
    name: 'ミミさん',
    title: 'せんたく好き',
    home: offset(VILLAGE_CENTERS[1]!, -0.05, -0.02, 0.04),
    seed: 107,
    smalltalk: [
      '今日は風がいいから、シーツがよく乾くわ',
      'せっけんに のばなを入れると、いい香りになるのよ',
      '雨の日はね、おうちで繕いものをするの',
    ],
  },
  {
    id: 'gata',
    name: 'ガタさん',
    title: '大工',
    home: offset(VILLAGE_CENTERS[2]!, 0.05, 0.02, -0.03),
    seed: 108,
    smalltalk: [
      'いい家はな、木の声を聞いて建てるんだ',
      'どこか建てつけの悪い家があったら教えてくれ',
      'つぎは村に鐘つき塔を建てたいんだがなあ',
    ],
  },
  {
    id: 'yuki',
    name: 'ユキさん',
    title: 'うたよみ',
    home: new THREE.Vector3(0.35, 0.9, -0.2).normalize(),
    seed: 109,
    smalltalk: [
      '「まるき星 あるけばもとの 場所にでる」…ふふ',
      '風の音にも、ふしがあるのよ',
      '流れ星を見たら、うたがひとつ生まれるの',
    ],
  },
  {
    id: 'nene',
    name: 'ネネばあ',
    title: 'おはなし係',
    home: offset(VILLAGE_CENTERS[2]!, -0.03, -0.04, 0.05),
    seed: 110,
    smalltalk: [
      'むかしむかし、この星がまだ小さかったころ…おっと、続きはまた今度',
      '前の薬師さんかい? ええ、ええ、よう知っとるよ',
      'あんたの羽織、いい色だねえ',
    ],
  },
];
