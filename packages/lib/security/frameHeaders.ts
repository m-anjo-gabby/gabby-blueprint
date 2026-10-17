/**
 * 他のサイトの iframe への埋め込みを禁止するレスポンスヘッダー（全アプリ共通。各アプリの next.config.ts の headers() で全パスに付ける）。
 * クリックジャッキング（透明な iframe を重ねて意図しない操作をさせる攻撃）を防ぐ。
 * Webトライアルの申込（student /trial）もコーポレートサイトには埋め込ませず、別タブのリンクで開いてもらう。
 * frame-ancestors は新しいブラウザ向け、X-Frame-Options は古いブラウザ向け（両方を返す）。
 * こちらが他のサイトを埋め込む向き（CAPTCHA の iframe 等）には影響しない。
 *
 * 💡 next.config.ts から相対パスで読み込むため、このファイルは他のモジュールを import しない。
 */
export const FRAME_DENY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
];
