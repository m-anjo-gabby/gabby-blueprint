/**
 * お知らせの表示（ポップアップ・ホームのカード・一覧のみ／見出し画像・行動ボタン・添付）を画面で確かめるためのデータ投入スクリプト。
 *
 * 使い方:
 *   pnpm exec tsx testing/features/branches/feature-20261008-dev/notice-display-seed.ts --env=dev
 *     … 専用テナント宛てのお知らせを作り直す（既存の同テナント宛てお知らせ・既読は削除）
 *   pnpm exec tsx testing/features/branches/feature-20261008-dev/notice-display-seed.ts --env=dev --reset-read
 *     … お知らせは作り直さず、既読・ボタンを押した記録だけを消す（もう一度最初から確かめる）
 *
 * 確認に使うアカウント: qa-student-07（専用テナント「【QA固定】ポップアップ検証」。パスワードは QA_LIVE_SESSION_TEST_PASSWORD）。
 * テナント限定で配信するため、他の利用者には表示されない。E2E（popup-control.spec.ts）を実行すると、このテナント宛てのお知らせは削除される。
 *
 * 投入するお知らせ（ポップアップは重要→公開日の新しい順に1件ずつ出る。再読み込みすると次の1件）:
 *   ポップアップ
 *     ① 重要・メンテナンス: 長いMarkdown本文（見出し・箇条書き・表）＋添付PDF → 「続きを読む」で全文と添付
 *     ② キャンペーン: 見出し画像＋外部リンクの行動ボタン（別タブ）
 *     ③ アップデート: アプリ内の行動ボタン（/library）。画像なし
 *     ④ お知らせ: 短い本文だけ → 「続きを読む」が出ない
 *   ホームのカード
 *     ⑤ キャンペーン: 見出し画像＋アプリ内の行動ボタン（/favorites） → PC幅では左に画像
 *     ⑥ アップデート: 画像・ボタンなし → 「詳しく見る」だけ。⑤と合わせて「ほかに1件のお知らせ」
 *   一覧のみ
 *     ⑦ お知らせ: 見出し画像＋行動ボタン → ポップアップ・ホームには出ず、お知らせ一覧で開くと画像とボタン
 */
import { crc32, deflateSync } from 'node:zlib';
import { clearPopupNotices, loadPopupFixture, markOtherNoticesRead } from '../../../e2e/support/popupFixtures.ts';
import { loadTestEnv, resolveTestEnvFromArgs } from '../../../helpers/env.ts';

const env = resolveTestEnvFromArgs();
loadTestEnv(env);
const RESET_READ_ONLY = process.argv.includes('--reset-read');

const fixture = await loadPopupFixture();
const { admin, clientId, userId } = fixture;

console.log(`\n=== お知らせの表示 確認データ: env=${env} ===`);

// テスト外のポップアップ・ホームのカード（全体配信など）は既読にし、ここで作る分だけが出るようにする
await markOtherNoticesRead(fixture);

if (RESET_READ_ONLY) {
  const { data: notices, error } = await admin.from('com_m_notice').select('notice_id').eq('client_id', clientId);
  if (error) throw error;
  const ids = (notices ?? []).map((n) => n.notice_id as string);
  if (ids.length > 0) {
    const { error: delErr } = await admin.from('com_t_notice_read').delete().eq('user_id', userId).in('notice_id', ids);
    if (delErr) throw delErr;
  }
  console.log(`既読・ボタンを押した記録を消しました（${ids.length}件のお知らせ）。`);
  process.exit(0);
}

await clearPopupNotices(fixture);

// ---------------------------------------------------------------------------
// 見出し画像（16:9 の PNG。文字は入れず、ブランド色のグラデーションと帯で向き・切り抜きが分かるようにする）
// ---------------------------------------------------------------------------
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makeImage(
  width: number,
  height: number,
  from: [number, number, number],
  to: [number, number, number],
): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      // 左上の帯（切り抜き位置の目印）と、中央の横帯
      const band = (x < width * 0.08 && y < height * 0.14) || (y > height * 0.45 && y < height * 0.55);
      for (let c = 0; c < 3; c++) {
        const v = Math.round(from[c] + (to[c] - from[c]) * t);
        raw[row + 1 + x * 3 + c] = band ? Math.min(255, v + 90) : v;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 最小限の1ページのPDF（添付ファイルの表示・保存の確認用） */
function makePdf(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '', // 4: contents（下で組み立てる）
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = 'BT /F1 24 Tf 72 760 Td (Maintenance details - sample attachment) Tj ET';
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function upload(path: string, body: Buffer, contentType: string): Promise<void> {
  const { error } = await admin.storage.from('notices').upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`Storage へのアップロードに失敗（${path}）: ${error.message}`);
}

// ---------------------------------------------------------------------------
// お知らせ
// ---------------------------------------------------------------------------
type DisplayMode = 'POPUP' | 'HOME' | 'LIST';
interface Pattern {
  title: string;
  displayMode: DisplayMode;
  noticeType: 'INFO' | 'CAMPAIGN' | 'MAINTENANCE' | 'UPDATE';
  important?: boolean;
  content: string;
  image?: { from: [number, number, number]; to: [number, number, number] };
  cta?: { label: string; url: string };
  pdf?: boolean;
}

const LONG_CONTENT = `いつも Gabby Blueprint をご利用いただきありがとうございます。

サービス品質向上のため、下記の日程でシステムメンテナンスを実施いたします。メンテナンス中はアプリをご利用いただけません。

## 日時

2026年11月15日（日）2:00〜6:00（日本時間）

## ご利用いただけない機能

- トレーニングの実施・記録
- ライブセッションの予約・変更
- **チャット**

| 時間帯 | 影響 |
|---|---|
| 2:00〜4:00 | すべての機能 |
| 4:00〜6:00 | ライブセッションの予約のみ |

詳しくは添付の資料、または[よくある質問](https://example.com/faq)をご覧ください。

> ご不便をおかけしますが、ご理解のほどよろしくお願いいたします。`;

const PATTERNS: Pattern[] = [
  {
    title: '【確認①】システムメンテナンスのお知らせ（11月15日）',
    displayMode: 'POPUP',
    noticeType: 'MAINTENANCE',
    important: true,
    content: LONG_CONTENT,
    pdf: true,
  },
  {
    title: '【確認②】秋の学習応援キャンペーン',
    displayMode: 'POPUP',
    noticeType: 'CAMPAIGN',
    content:
      '期間中にトレーニングを10日以上実施した方に、特典をご用意しています。対象期間や応募方法はキャンペーンページをご覧ください。外部ページは別のタブで開きます。',
    image: { from: [24, 71, 195], to: [14, 49, 150] },
    cta: { label: 'キャンペーンページを見る', url: 'https://example.com/campaign' },
  },
  {
    title: '【確認③】教材ライブラリに新しい単語帳を追加しました',
    displayMode: 'POPUP',
    noticeType: 'UPDATE',
    content: 'ビジネス会議でよく使う表現をまとめた単語帳を追加しました。教材ライブラリからご利用いただけます。',
    cta: { label: '教材を見る', url: '/library' },
  },
  {
    title: '【確認④】年末年始のサポート窓口について',
    displayMode: 'POPUP',
    noticeType: 'INFO',
    content: '12月29日〜1月3日はサポート窓口をお休みします。',
  },
  {
    title: '【確認⑤】お気に入り機能が使いやすくなりました',
    displayMode: 'HOME',
    noticeType: 'CAMPAIGN',
    content:
      '単語・フレーズ・スプリントの問題をお気に入りに登録し、種類ごとに一覧で見返せるようになりました。復習にぜひお役立てください。',
    image: { from: [52, 103, 225], to: [10, 38, 117] },
    cta: { label: 'お気に入りを開く', url: '/favorites' },
  },
  {
    title: '【確認⑥】学習記録の表示を改善しました',
    displayMode: 'HOME',
    noticeType: 'UPDATE',
    content:
      '学習記録の画面で、週ごとの実施日数がひと目で分かるようになりました。詳しい変更点はお知らせの本文をご覧ください。',
  },
  {
    title: '【確認⑦】ご利用ガイドを更新しました（一覧のみ）',
    displayMode: 'LIST',
    noticeType: 'INFO',
    content:
      'アプリのご利用ガイドを最新の画面に合わせて更新しました。このお知らせはポップアップ・ホームには出ず、お知らせ一覧にだけ表示されます。',
    image: { from: [97, 142, 240], to: [24, 71, 195] },
    cta: { label: '教材を見る', url: '/library' },
  },
];

const now = Date.now();
for (const [i, p] of PATTERNS.entries()) {
  const noticeId = crypto.randomUUID();
  let imagePath: string | null = null;
  if (p.image) {
    imagePath = `notices/${noticeId}/image/${crypto.randomUUID()}.png`;
    await upload(imagePath, makeImage(960, 540, p.image.from, p.image.to), 'image/png');
  }
  const attachments = [];
  if (p.pdf) {
    const path = `notices/${noticeId}/maintenance-details.pdf`;
    const body = makePdf();
    await upload(path, body, 'application/pdf');
    attachments.push({
      id: crypto.randomUUID(),
      name: 'メンテナンス詳細.pdf',
      path,
      size: body.length,
      mime_type: 'application/pdf',
    });
  }

  const { error } = await admin.from('com_m_notice').insert({
    notice_id: noticeId,
    target_type: 'CLIENT',
    client_id: clientId,
    notice_type: p.noticeType,
    is_important: p.important ?? false,
    display_mode: p.displayMode,
    title: p.title,
    content: p.content,
    attachments,
    image_path: imagePath,
    cta_label: p.cta?.label ?? null,
    cta_url: p.cta?.url ?? null,
    is_published: true,
    // 一覧の並びを番号順にするため、公開日時を1分ずつずらす（①が最も新しい）
    published_at: new Date(now - (i + 1) * 60_000).toISOString(),
  });
  if (error) throw new Error(`お知らせの作成に失敗（${p.title}）: ${error.message}`);
  console.log(`  ✓ ${p.title} [${p.displayMode}]`);
}

console.log(`
投入しました。qa-student-07@gabby-qa-test.example でログインして確かめてください。
  - ホームを開くたびにポップアップが1件ずつ出ます（再読み込みで次の1件）。ホームの上部には ⑤ のカードが出ます。
  - もう一度最初から確かめる場合は --reset-read を付けて実行してください。
`);
