import * as THREE from 'three';
import { VILLAGE_CENTERS, PASTURES, FLOWER_FIELDS, LAKES, OEN_JUNCTION } from '../world.ts';
import { moveToward } from '../town.ts';

/**
 * 名前つき村人の台帳。
 * 既存の村人20人とは別に、ここに書いた住人が talk 機能によって星に増える
 * (星1に10人、星2〜5に各5人。planet で住む星を指定する)。
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
  /** 住んでいる星(省略時は1=薬草の星)。その星でだけ登場する */
  planet?: number;
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
  // --- はるかぜの星(春)の住人 ---
  {
    id: 'saku',
    name: 'サクさん',
    title: '桜もり',
    home: offset(FLOWER_FIELDS[0]!, 0.05, -0.03, 0.03),
    seed: 211,
    planet: 2,
    smalltalk: [
      'この星の桜はね、一年じゅう咲いてるの。ふしぎでしょう',
      '花びらのじゅうたんは、ふんでも怒らないわよ',
      '桜の下でお昼寝すると、いい夢が見られるの',
    ],
  },
  {
    id: 'ume',
    name: 'ウメさん',
    title: 'おだんご屋',
    home: offset(VILLAGE_CENTERS[1]!, 0.05, 0.03, -0.04),
    seed: 212,
    planet: 2,
    smalltalk: [
      'うちのだんごは、わかば草を練りこんであるのよ',
      '花よりだんご、って言うけどね。どっちもがいちばんよ',
      '薬草の星の薬師さん? 甘いものは薬にもなるのよ',
    ],
  },
  {
    id: 'pino',
    name: 'ピノ',
    title: 'むらのこども',
    home: offset(VILLAGE_CENTERS[0]!, -0.04, 0.04, 0.05),
    seed: 213,
    planet: 2,
    smalltalk: [
      '花びら、なんまいつかまえられるか勝負しない?',
      'きょうのかぜは、さくらのにおいがするよ!',
      'おっきくなったら、桜の木にのぼるんだ',
    ],
  },
  {
    id: 'fuu',
    name: 'フウさん',
    title: 'たこあげ名人',
    home: offset(VILLAGE_CENTERS[2]!, 0.05, 0.02, -0.04),
    seed: 214,
    planet: 2,
    smalltalk: [
      'はるかぜの星の風はね、たこあげにちょうどいいのさ',
      '風はともだち。けんかしないのがコツだよ',
      'こんど、花びらもようの凧を作るんだ',
    ],
  },
  {
    id: 'tane',
    name: 'タネじいさん',
    title: '種まき名人',
    home: offset(PASTURES[0]!, 0.03, -0.02, 0.05),
    seed: 215,
    planet: 2,
    smalltalk: [
      '種はな、まく人の鼻歌を聞いて育つんじゃよ',
      'この星の土は、春のにおいがするじゃろう',
      '花はいそがん。ゆっくり咲くのがええんじゃ',
    ],
  },

  // --- なぎさの星(夏)の住人 ---
  {
    id: 'kai',
    name: 'カイさん',
    title: '船大工',
    home: moveToward(LAKES[0]!.direction.clone(), VILLAGE_CENTERS[0]!, 0.56),
    seed: 221,
    planet: 3,
    smalltalk: [
      'いつかこの海をわたる船を作るのが夢なんだ',
      '木の板はな、波の音を聞かせるとよく曲がるんだよ',
      'ヤシの木ってのは、まったく便利な木だよなあ',
    ],
  },
  {
    id: 'nami',
    name: 'ナミさん',
    title: '海の家',
    home: moveToward(LAKES[0]!.direction.clone(), VILLAGE_CENTERS[1]!, 0.55),
    seed: 222,
    planet: 3,
    smalltalk: [
      'うちのかき氷はね、こおり花…じゃなくて、ないしょの氷で作るの',
      '砂浜のそうじはたいへんだけど、朝の海を見られるからね',
      '泳いだあとは、ちゃんとからだをふくのよ?',
    ],
  },
  {
    id: 'sango',
    name: 'サンゴ',
    title: 'かいがら集め',
    home: moveToward(LAKES[0]!.direction.clone(), VILLAGE_CENTERS[2]!, 0.58),
    seed: 223,
    planet: 3,
    smalltalk: [
      'このかいがら、耳にあてると波の音がするんだよ!',
      'いちばんきれいなかいがらは、あさひの浜にあるんだって',
      'おねえちゃんも、かいがら集める?',
    ],
  },
  {
    id: 'iso',
    name: 'イソじいさん',
    title: '磯番',
    home: offset(VILLAGE_CENTERS[0]!, 0.05, 0.03, -0.04),
    seed: 224,
    planet: 3,
    smalltalk: [
      '磯のいきものはな、さわったら元の場所に返すんじゃよ',
      '日ざしの強い日は、木かげで休むんじゃぞ',
      'この星の夕日はな、海にとけて甘くなるんじゃ',
    ],
  },
  {
    id: 'teru',
    name: 'テルさん',
    title: 'ひもの屋',
    home: offset(VILLAGE_CENTERS[2]!, -0.04, 0.03, 0.05),
    seed: 225,
    planet: 3,
    smalltalk: [
      'おてんとさまは、いちばんの料理人なのよ',
      'しおかぜ草をしいて干すと、風味がぐんとよくなるの',
      '浜のみんなは、みんな家族みたいなものだからね',
    ],
  },

  // --- もみじの星(秋)の住人 ---
  {
    id: 'kaede',
    name: 'カエデさん',
    title: '畑番',
    home: offset(PASTURES[0]!, 0.04, -0.02, 0.03),
    seed: 231,
    planet: 4,
    smalltalk: [
      'この星の畑はね、一年じゅう実りの秋なのよ',
      'くりの実はとげとげだけど、なかみは甘いの。人とおんなじね',
      '土のにおいをかぐと、今日の天気がわかるのよ',
    ],
  },
  {
    id: 'kino',
    name: 'キノさん',
    title: 'きのこ博士',
    home: offset(VILLAGE_CENTERS[0]!, -0.05, 0.03, 0.04),
    seed: 232,
    planet: 4,
    smalltalk: [
      'もみじ茸はね、紅葉の木の根もとがすきなんだ',
      'きのこはともだち。でも知らないきのこは食べちゃだめだよ',
      'むらさき茸との出会いが、わたしの研究のはじまりでね',
    ],
  },
  {
    id: 'guri',
    name: 'グリ',
    title: 'むらのこども',
    home: offset(VILLAGE_CENTERS[2]!, 0.04, 0.04, -0.05),
    seed: 233,
    planet: 4,
    smalltalk: [
      '落ち葉のプールにとびこむの、きもちいいんだよ!',
      'くりひろい、モリさんにはまだ勝てないんだ',
      'きょう、いちばん赤いはっぱを見つけたんだ!',
    ],
  },

  // --- こなゆきの星(冬)の住人 ---
  {
    id: 'koyuki',
    name: 'コユキさん',
    title: 'あみもの屋',
    home: offset(VILLAGE_CENTERS[1]!, 0.05, 0.02, -0.05),
    seed: 241,
    planet: 5,
    smalltalk: [
      '雪の日はね、あみものがいちばんはかどるの',
      'ひつじの毛のマフラー、こんど編んであげましょうか',
      '雪あかりの下だと、白い毛糸がほんのり青く見えるのよ',
    ],
  },
  {
    id: 'taki',
    name: 'タキさん',
    title: 'スープ屋',
    home: offset(VILLAGE_CENTERS[2]!, -0.05, 0.02, 0.04),
    seed: 242,
    planet: 5,
    smalltalk: [
      '寒い星のスープ屋はね、みんなの暖炉みたいなものなの',
      'スープのこつはね、ことこと、ゆっくり、まつことよ',
      '湯気のむこうに見える雪って、きれいでしょう',
    ],
  },
  {
    id: 'mafu',
    name: 'マフ',
    title: 'むらのこども',
    home: offset(VILLAGE_CENTERS[0]!, 0.04, 0.04, 0.05),
    seed: 243,
    planet: 5,
    smalltalk: [
      'ゆきだるま作ったんだ! 目がまだないんだけどね',
      '雪をふむ音って、きゅっきゅっていうんだよ',
      'さむくないよ! はしってるからね!',
    ],
  },

  {
    id: 'mori',
    name: 'モリさん',
    title: '木こり',
    home: offset(VILLAGE_CENTERS[1]!, 0.05, 0.04, -0.04),
    seed: 201,
    planet: 4,
    smalltalk: [
      'この星の木は、一年じゅう紅葉しててな。飽きんのだ',
      'あかね草はこの星の生まれでな。夕焼けが根づいたのさ',
      '月しろ草なら、夜に白く光ってるからすぐ分かるぞ',
    ],
  },
  {
    id: 'hina',
    name: 'ヒナさん',
    title: 'はちみつ屋',
    home: offset(FLOWER_FIELDS[0]!, 0.04, -0.02, 0.03),
    seed: 202,
    planet: 4,
    smalltalk: [
      'この星のはちみつは、もみじの香りがするのよ',
      'ハチたちも、あなたのこと覚えたみたい',
      '薬草の星から来たの? まあ、遠いところをようこそ',
    ],
  },
  {
    id: 'shio',
    name: 'シオじいさん',
    title: '星のもり番',
    home: offset(VILLAGE_CENTERS[2]!, 0.04, 0.03, -0.05),
    seed: 203,
    planet: 5,
    smalltalk: [
      'こなゆきの星はな、雪の日はしんと静かになるんじゃ',
      'むらさき茸はこの星にしか生えん。大事にな',
      '前の薬師さんも、一度この星に来たことがあるんじゃよ',
    ],
  },
  {
    id: 'ruri',
    name: 'ルリさん',
    title: 'ほしよみ',
    home: offset(VILLAGE_CENTERS[1]!, -0.04, 0.05, 0.03),
    seed: 204,
    planet: 5,
    smalltalk: [
      'ここから見る星空は、薬草の星とすこし違うでしょう?',
      '星あかりを集める人は、星に好かれるのよ',
      'すずふり草の鈴は、星の音に似ているの',
    ],
  },
];
