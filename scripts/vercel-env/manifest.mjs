// scripts/vercel-env/manifest.mjs
//
// アプリの環境変数の定義（正本）。変数を追加・廃止するときは、ここを変更してから
// `node scripts/vercel-env/run.mjs --write-examples` で apps/*/.env.example を作り直し、
// 各環境に `--apply` で反映する。運用手順は同ディレクトリの README.md。
//
// value（環境ごとの値の決め方。env を書かない環境は default を使う）:
//   LOCAL     値ファイル（values/.env.<env>）に必須
//   OPTIONAL  値ファイルに書いた場合だけ設定する（空なら設定しない。Vercel にあれば削除する）
//   UNSET     設定しない（Vercel にあれば削除する）
//   文字列    固定値（値ファイルには書かない）
//   関数      ({ env, app, config }) => 値。URL など環境の定義から決まる値（値ファイルには書かない）
//
// secret: true の変数は、このツールの表示・ログで値を伏せる（Vercel には他の変数と同じく encrypted で登録する）。
// generate: true の変数は、--init で値ファイルが空ならランダムな値を作る。
// note: その変数を追加・変更したときに、反映後に必要な作業として表示する。

export const LOCAL = 'local';
export const OPTIONAL = 'optional';
export const UNSET = 'unset';

const supabaseUrl = ({ config }) => `https://${config.supabaseRef}.supabase.co`;
const ownUrl = ({ app, config }) => config.urls[app];
/** dev・staging で通知・リマインダーのメールを送ってよい宛先のドメイン（テスト用・社内） */
const TEST_DOMAINS = 'resend.dev,gabbyacademy.com,gvtech.co.jp';

/**
 * @typedef {'https-url' | 'mail-from' | 'email-list' | 'domain-list' | 'random-secret' | 'minutes' | string[] | RegExp} Validator
 * @typedef {string | ((ctx: { env: string, app: string, config: import('./environments.mjs').EnvironmentConfig }) => string)} ValueSpec
 * @typedef {{
 *   key: string,
 *   apps: Array<'admin' | 'student' | 'coach'>,
 *   group: string,
 *   description: string,
 *   secret?: boolean,
 *   generate?: boolean,
 *   validate?: Validator,
 *   value: { default: ValueSpec, dev?: ValueSpec, staging?: ValueSpec, prod?: ValueSpec },
 *   note?: string,
 *   removed?: boolean,
 * }} EnvVarDefinition
 */

/** @type {EnvVarDefinition[]} */
export const MANIFEST = [
  // ---------------------------------------------------------------- Supabase
  {
    key: 'NEXT_PUBLIC_SUPABASE_URL',
    apps: ['admin', 'student', 'coach'],
    group: 'Supabase',
    description: 'Supabase のプロジェクトの URL（environments.mjs の supabaseRef から決まる）',
    validate: 'https-url',
    value: { default: supabaseUrl },
  },
  {
    key: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    apps: ['admin', 'student', 'coach'],
    group: 'Supabase',
    description: 'Supabase の公開キー（ダッシュボード > Project Settings > API Keys）',
    validate: /^(sb_publishable_|eyJ)/,
    value: { default: LOCAL },
  },
  {
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    apps: ['admin', 'student', 'coach'],
    group: 'Supabase',
    description: 'Supabase の service_role キー（サーバー専用。ブラウザに出さない）',
    secret: true,
    validate: /^(sb_secret_|eyJ)/,
    value: { default: LOCAL },
  },

  // ---------------------------------------------------------------- サイトURL
  {
    key: 'NEXT_PUBLIC_SITE_URL',
    apps: ['admin', 'student', 'coach'],
    group: 'サイトURL',
    description: '本アプリ自身の URL（パスワード再設定のメールのリンク等。environments.mjs の urls から決まる）',
    validate: 'https-url',
    value: { default: ownUrl },
  },
  {
    key: 'NEXT_PUBLIC_STUDENT_URL',
    apps: ['admin'],
    group: 'サイトURL',
    description: '生徒のポータルの URL（招待・通知のメールのリンク、代理ログイン）',
    validate: 'https-url',
    value: { default: ({ config }) => config.urls.student },
  },
  {
    key: 'NEXT_PUBLIC_COACH_URL',
    apps: ['admin'],
    group: 'サイトURL',
    description: 'コーチのポータルの URL（招待・通知のメールのリンク、代理ログイン）',
    validate: 'https-url',
    value: { default: ({ config }) => config.urls.coach },
  },

  // ---------------------------------------------------------------- Azure
  {
    key: 'AZURE_SPEECH_SERVICE_KEY',
    apps: ['admin', 'student', 'coach'],
    group: 'Azure Speech Service（TTS/STT）',
    description: 'Azure Speech のキー',
    secret: true,
    value: { default: LOCAL },
  },
  {
    key: 'AZURE_SPEECH_REGION',
    apps: ['admin', 'student', 'coach'],
    group: 'Azure Speech Service（TTS/STT）',
    description: 'Azure Speech のリージョン（例: japaneast）',
    validate: /^[a-z0-9]+$/,
    value: { default: LOCAL },
  },

  // ---------------------------------------------------------------- Resend
  {
    key: 'RESEND_API_KEY',
    apps: ['admin', 'student', 'coach'],
    group: 'Resend（メール送信）',
    description: 'Resend の API キー',
    secret: true,
    validate: /^re_/,
    value: { default: LOCAL },
  },
  {
    key: 'MAIL_FROM_AUTH',
    apps: ['admin', 'student', 'coach'],
    group: 'Resend（メール送信）',
    description: '招待・パスワード再設定のメールの送信元（送信ドメイン認証したドメインのアドレス）',
    validate: 'mail-from',
    value: {
      default: 'Gabby Academy <noreply@mail.gabbyacademy.com>',
      dev: '[DEV] Gabby Academy <noreply@mail.gabbyacademy.com>',
      staging: '[STG] Gabby Academy <noreply@mail.gabbyacademy.com>',
    },
  },
  {
    key: 'MAIL_FROM_NOTIFY',
    apps: ['admin'],
    group: 'Resend（メール送信）',
    description: '通知・リマインダーのメールの送信元（未設定なら MAIL_FROM_AUTH）',
    validate: 'mail-from',
    value: {
      default: 'Gabby Blueprint <notify@mail.gabbyacademy.com>',
      dev: OPTIONAL,
      staging: '[STG] Gabby Blueprint <notify@mail.gabbyacademy.com>',
    },
  },
  {
    key: 'CRON_SECRET',
    apps: ['admin'],
    group: 'Resend（メール送信）',
    description: 'メール送信処理（/api/cron/mail-dispatch）の秘密のキー（Supabase Vault の mail_dispatch_secret と同じ値）',
    secret: true,
    generate: true,
    validate: 'random-secret',
    value: { default: LOCAL },
    note: 'Supabase Vault の mail_dispatch_secret を同じ値に更新する（README.md「CRON_SECRET を変えたとき」）',
  },
  {
    key: 'MAIL_DISPATCH_MODE',
    apps: ['admin'],
    group: 'Resend（メール送信）',
    description:
      '通知・リマインダーのメールの送信の範囲（all: 全員 / allowlist: 許可リストのドメインだけ / off: 送らない）。未設定・不明な値は off',
    validate: ['all', 'allowlist', 'off'],
    value: { default: 'all', dev: 'allowlist', staging: 'allowlist' },
  },
  {
    key: 'MAIL_DISPATCH_RECIPIENT_ALLOWLIST',
    apps: ['admin'],
    group: 'Resend（メール送信）',
    description: 'MAIL_DISPATCH_MODE=allowlist のときの送信先ドメインの許可リスト（カンマ区切り）',
    validate: 'domain-list',
    value: { default: UNSET, dev: TEST_DOMAINS, staging: TEST_DOMAINS },
  },
  {
    key: 'RESEND_WEBHOOK_SECRET',
    apps: ['admin'],
    group: 'Resend（メール送信）',
    description: 'Resend の Webhook（/api/webhooks/resend。メールの到達状況）の Signing Secret。未設定なら Webhook を受け付けない',
    secret: true,
    validate: /^whsec_/,
    value: { default: LOCAL, dev: OPTIONAL },
  },
  {
    key: 'MAIL_OPS_ALERT_TO',
    apps: ['admin'],
    group: 'Resend（メール送信）',
    description:
      '運営向けのメール配信の日次の要約の宛先（カンマ区切り。毎日 09:00 JST に送る。問題が無い日も「異常なし」で送り、届くこと自体を送信処理の生存確認にする。未設定なら送らない）',
    validate: 'email-list',
    value: { default: LOCAL, dev: OPTIONAL, staging: OPTIONAL },
  },
  {
    key: 'MAIL_UNSUBSCRIBE_SECRET',
    apps: ['admin', 'student', 'coach'],
    group: 'Resend（メール送信）',
    description: 'メールのログイン不要の配信停止リンクの署名鍵（3アプリで同じ値。未設定なら配信停止リンク・List-Unsubscribe を付けない）',
    secret: true,
    generate: true,
    validate: 'random-secret',
    value: { default: LOCAL },
    note: '変えると、送信済みのメールの配信停止リンクは使えなくなる',
  },
  {
    key: 'MAIL_LOGO_URL',
    apps: ['admin', 'student', 'coach'],
    group: 'Resend（メール送信）',
    description: 'メールのロゴ画像の URL（未設定なら本番 https://blueprint.gabbyacademy.com/mail-logo.png）。本番に未反映の画像を試す環境だけ指定',
    validate: 'https-url',
    value: {
      default: UNSET,
      dev: OPTIONAL,
      staging: ({ config }) => `${config.urls.student}/mail-logo.png`,
    },
  },

  // ---------------------------------------------------------------- Gemini
  {
    key: 'GEMINI_API_KEY',
    apps: ['admin'],
    group: 'Gemini（AI機能）',
    description: 'Gemini の API キー',
    secret: true,
    value: { default: LOCAL },
  },

  // ---------------------------------------------------------------- Zoom
  {
    key: 'ZOOM_VIDEO_SDK_KEY',
    apps: ['student', 'coach'],
    group: 'Zoom Video SDK（ライブセッション）',
    description: 'Zoom Video SDK のキー',
    secret: true,
    value: { default: LOCAL },
  },
  {
    key: 'ZOOM_VIDEO_SDK_SECRET',
    apps: ['student', 'coach'],
    group: 'Zoom Video SDK（ライブセッション）',
    description: 'Zoom Video SDK の秘密のキー',
    secret: true,
    value: { default: LOCAL },
  },

  // ---------------------------------------------------------------- 検証用
  {
    key: 'NEXT_PUBLIC_LIVE_SESSION_WARNING_MINUTES',
    apps: ['student', 'coach'],
    group: '検証用の上書き（本番は設定しない）',
    description: 'ライブセッションの終了予告までの分数（既定 25）',
    validate: 'minutes',
    value: { default: OPTIONAL, prod: UNSET },
  },
  {
    key: 'NEXT_PUBLIC_LIVE_SESSION_END_MINUTES',
    apps: ['student', 'coach'],
    group: '検証用の上書き（本番は設定しない）',
    description: 'ライブセッションの自動終了までの分数（既定 30）',
    validate: 'minutes',
    value: { default: OPTIONAL, prod: UNSET },
  },
  {
    key: 'NEXT_PUBLIC_LIVE_SESSION_EARLY_JOIN_MINUTES',
    apps: ['student', 'coach'],
    group: '検証用の上書き（本番は設定しない）',
    description: 'ライブセッションに開始前から入室できる分数（既定 5）',
    validate: 'minutes',
    value: { default: OPTIONAL, prod: UNSET },
  },
  {
    key: 'NEXT_PUBLIC_SPEECH_RECOGNIZER',
    apps: ['student'],
    group: '検証用の上書き（本番は設定しない）',
    description: '音声認識の方式。"fake" でテスト用の認識に切り替える（本番では絶対に設定しない）',
    validate: ['fake'],
    value: { default: OPTIONAL, prod: UNSET },
  },
  {
    key: 'NEXT_PUBLIC_ADMIN_URL',
    apps: ['admin', 'student', 'coach'],
    group: '廃止',
    description: 'アドミンの URL（モノレポへの移行以降、コードで使っていない）',
    removed: true,
    value: { default: UNSET },
  },
  {
    key: 'LOG_LEVEL',
    apps: ['admin', 'student', 'coach'],
    group: 'ログ',
    description: 'サーバーのログの出力レベル（既定 info。trace / debug / info / warn / error）',
    validate: ['trace', 'debug', 'info', 'warn', 'error'],
    value: { default: OPTIONAL },
  },
];

/**
 * Vercel・Next.js が自動で設定する変数（管理対象外。差分に出さない）。
 * VERCEL_OIDC_TOKEN は `vercel env pull` で .env.local に入る。
 */
export const SYSTEM_KEY_PATTERN = /^(VERCEL_|VERCEL$|NX_|TURBO_)/;
