import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    // バンドルの大半はThree.js本体とポストプロセスで、
    // この作品は起動時にすべて必要になるため、コード分割の恩恵がない。
    // 実測 約624KB(gzip 約160KB)を把握したうえで、警告のしきい値を引き上げる
    chunkSizeWarningLimit: 700,
  },
  test: {
    // Canvasテクスチャ生成などがDOM APIを使うため、軽量なDOM実装で実行する
    environment: 'happy-dom',
  },
});
