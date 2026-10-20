/**
 * 開発サーバー（next dev）の開発用リソース（/_next/* 等）を、localhost 以外から読み込ませてよいホスト（全アプリ共通。各アプリの next.config.ts の allowedDevOrigins）。
 * 同じ LAN の実機（iPhone 等）から PC の IP で開くと、Next.js は既定でこれを拒否し、JS が読めずに画面が操作できなくなる。
 * PC の IP は接続先のネットワークで変わるため、個々の IP ではなくプライベートアドレスの範囲で許す（172.16.0.0/12 はワイルドカードで書けないため、必要になったら足す）。
 * next dev のときだけ効き、本番ビルドには影響しない。
 *
 * next.config.ts から相対パスで読み込むため、このファイルは他のモジュールを import しない。
 */
export const LOCAL_NETWORK_DEV_ORIGINS = ['10.*.*.*', '192.168.*.*'];
