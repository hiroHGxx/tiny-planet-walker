import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages はサブパス(https://<user>.github.io/tiny-planet-walker/)で
  // 配信されるため、アセットの参照パスをリポジトリ名に合わせる
  base: '/tiny-planet-walker/',
  build: {
    // バンドルの大半はThree.js本体とポストプロセスで、
    // この作品は起動時にすべて必要になるため、コード分割の恩恵がない。
    // 実測 約737KB(gzip 約199KB。5星・依頼5章・薬草20種時点)を
    // 把握したうえで、警告のしきい値を引き上げる
    chunkSizeWarningLimit: 800,
  },
  test: {
    // Canvasテクスチャ生成などがDOM APIを使うため、軽量なDOM実装で実行する
    environment: 'happy-dom',
  },
});
