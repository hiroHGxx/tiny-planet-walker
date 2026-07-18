---
name: verify
description: tiny-planet-walkerをブラウザで実際に動かして変更を検証する手順
---

# 動作検証の手順

## 起動

```bash
npm run dev   # http://localhost:5173/tiny-planet-walker/ (baseパスに注意)
```

Chrome自動操作(claude-in-chromeツール)でこのURLを開く。
拡張が未接続なら `open -a "Google Chrome"` してから再試行する。

**最初にタイトル画面が出る。** `#title-start`(はじめる)をクリックするまで
移動キーはcaptureで堰き止められているので、検証は必ず
`document.querySelector('#title-start').click()` から始めること。
このクリックがAudioContextの解錠も兼ねる。

## 操作の再現方法

- **移動**: 合成キーイベントで動く。keydownを1回送れば押しっぱなし扱いになり、
  keyupで止まる(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))`)。
  `blur` で全入力が解除される点に注意
- **テレポート**: DEVビルドでは `window.__player` がプレイヤーのGroup。
  `__player.position.set(x,y,z).normalize().multiplyScalar(25)` で任意地点へ飛べる
  (毎フレーム半径へ正規化されるので安全)
- **場所の座標**: 村・湖・薬草群生地の方向ベクトルは `src/world.ts` の
  モジュール定数(`VILLAGE_CENTERS` / `HERB_CLUSTER_CENTERS` など)を参照

## 確認ポイント

- 移動後も `__player.position.length()` が 25.000 のままか(球面移動の健全性)
- コンソールエラーゼロ(`read_console_messages` の onlyErrors)
- UI状態はDOMで直接読める: `#journal-toggle`(図鑑ボタン)、`#journal-toast`、
  `.speech-bubble`(つぶやき)、`#audio-toggle`(音ボタン)
- localStorageキー: `tiny-planet-walker:journal` / `tiny-planet-walker:muted`

## 注意

- ウィンドウを最小化するとrequestAnimationFrameが止まりFPS 0になる。
  Chromeウィンドウは表示したままにする
- 音は自動再生制限のため最初のキー/ポインタ操作後に始まる。
  合成イベントでもAudioContextは作られるが、実音の確認は目視(ボタン表示)まで
