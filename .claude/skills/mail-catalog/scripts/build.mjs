// 書き出したメール（testing/features/mail-samples/send-mail-samples.ts --out）を画像にし、
// メール文面カタログ（アーティファクト用HTML）を組み立てる。
// 実行（リポジトリルートで）:
//   node .claude/skills/mail-catalog/scripts/build.mjs --mails=<書き出したフォルダ> --out=<出力HTML> --branch=<ブランチ名> [--date=YYYY-MM-DD]
// - GROUPS に無いサンプルが書き出されていたらエラーにする（新しいメールの載せ漏れを防ぐ）。
// - Playwright は testing/ の依存を使う。
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const MAILS = opt('mails');
const OUT = opt('out');
const BRANCH = opt('branch') ?? '';
const DATE = opt('date') ?? new Date().toISOString().slice(0, 10);
if (!MAILS || !OUT) {
  process.stderr.write('usage: build.mjs --mails=<dir> --out=<file.html> --branch=<branch> [--date=YYYY-MM-DD]\n');
  process.exit(1);
}
const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'template.html');
const require = createRequire(resolve('testing/package.json'));
const { chromium } = require('@playwright/test');

const G = (title, intro, items) => ({ title, intro, items });
/** 区分と各サンプルの表示名・宛先・タイミング。send-mail-samples.ts の label と対応させる */
const GROUPS = [
  G('アカウント（招待・パスワード再設定）', '従来からあるメールを、新しい共通の外枠に揃えました。配信停止の対象外です。管理者宛ては日本語・英語の併記です。', [
    ['auth-student-INVITE', '招待（生徒）', '生徒', '管理画面から招待したとき'],
    ['auth-coach-INVITE', '招待（コーチ）', 'コーチ', '管理画面から招待したとき'],
    ['auth-admin-INVITE', '招待（管理者）', '管理者', '管理画面から招待したとき'],
    ['auth-student-RESET', 'パスワード再設定（生徒）', '生徒', '再設定を申請したとき'],
    ['auth-coach-RESET', 'パスワード再設定（コーチ）', 'コーチ', '再設定を申請したとき'],
    ['auth-admin-RESET', 'パスワード再設定（管理者）', '管理者', '再設定を申請したとき'],
  ]),
  G('通知（生徒宛て）', '出来事が起きたらすぐ送ります。プロフィールの「メール通知」の「通知」で止められます。', [
    ['student-SESSION_CANCELLED_BY_COACH', 'コーチがセッションをキャンセル', '生徒', 'すぐ'],
    ['student-SESSION_RESCHEDULE_PROPOSED', 'コーチから振替候補の提案', '生徒', 'すぐ'],
    ['student-SESSION_BOOKING_APPROVED', '予約の承認', '生徒', 'すぐ'],
    ['student-SESSION_BOOKING_REJECTED', '予約の否認', '生徒', 'すぐ'],
    ['student-MATCHING_APPROVED', '専属コーチのマッチング成立', '生徒', 'すぐ'],
    ['student-MATCHING_REJECTED', '専属コーチのマッチング否認', '生徒', 'すぐ'],
    ['student-HOMEWORK_POSTED', 'コーチが宿題を出した', '生徒', 'すぐ'],
  ]),
  G('通知（コーチ宛て・英語）', 'コーチアプリの表示言語に合わせて英語で送ります。プロフィールの「Email notifications」で止められます。', [
    ['coach-SESSION_CANCELLED_BY_STUDENT', '生徒がセッションをキャンセル', 'コーチ', 'すぐ'],
    ['coach-SESSION_RESCHEDULE_PROPOSED_BY_STUDENT', '生徒から振替候補の提案', 'コーチ', 'すぐ'],
    ['coach-SESSION_BOOKED_BY_STUDENT', '生徒がセッションを予約', 'コーチ', 'すぐ'],
    ['coach-SESSION_BOOKING_REQUESTED', '生徒から予約の申請', 'コーチ', 'すぐ'],
    ['coach-MATCHING_ASSIGNED_TO_COACH', '専属コーチの担当が決定', 'コーチ', 'すぐ'],
    ['coach-COACH_REPORT_APPROVED', '月次レポートの承認', 'コーチ', 'すぐ'],
    ['coach-COACH_REPORT_APPROVAL_REVOKED', '月次レポートの承認の取り消し', 'コーチ', 'すぐ'],
  ]),
  G('チャットの新着', '未読のまま10分たったら1通だけ送ります。送る時点で既読なら送りません。', [
    ['student-CHAT_UNREAD', 'チャットの新着（生徒）', '生徒', '未読が10分続いたら'],
    ['coach-CHAT_UNREAD', 'チャットの新着（コーチ）', 'コーチ', '未読が10分続いたら'],
  ]),
  G('リマインダー（ライブセッション）', '予定のセッションの24時間前と1時間前に送ります。キャンセル・振替済み・開始済みには送りません。', [
    ['student-LIVE-24h', 'ライブセッション 24時間前（生徒）', '生徒', '24時間前'],
    ['student-LIVE-1h', 'ライブセッション 1時間前（生徒）', '生徒', '1時間前'],
    ['coach-LIVE-24h', 'ライブセッション 24時間前（コーチ）', 'コーチ', '24時間前'],
    ['coach-LIVE-1h', 'ライブセッション 1時間前（コーチ）', 'コーチ', '1時間前'],
  ]),
  G('リマインダー（グループセッション）', '参加登録した回（コーチは担当・参加登録した回）の24時間前と1時間前に送ります。シリーズの有無・参加URLの有無で表示が変わります。', [
    ['student-REMINDER-24h-series', 'グループセッション 24時間前（生徒・シリーズの回）', '生徒', '24時間前'],
    ['student-REMINDER-1h-single-nourl', 'グループセッション 1時間前（生徒・単発・参加URL未設定）', '生徒', '1時間前'],
    ['coach-REMINDER-24h-series', 'グループセッション 24時間前（コーチ・シリーズの回）', 'コーチ', '24時間前'],
    ['coach-REMINDER-1h', 'グループセッション 1時間前（コーチ）', 'コーチ', '1時間前'],
  ]),
  G('運営向けの日次の要約', '毎朝 9:00（日本時間）に運営の指定アドレスへ送ります。問題が無い日も届きます。日本語・英語の併記です。', [
    ['ops-DAILY_REPORT-ok', '日次の要約（異常なし）', '運営', '毎朝 9:00'],
    ['ops-DAILY_REPORT-issues', '日次の要約（要確認あり）', '運営', '毎朝 9:00'],
  ]),
];

const decode = (s) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const mapped = new Set(GROUPS.flatMap((g) => g.items.map(([label]) => label)));
const exported = readdirSync(MAILS).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, ''));
const unmapped = exported.filter((label) => !mapped.has(label));
if (unmapped.length) {
  process.stderr.write(`GROUPS に無いサンプルがあります（区分・表示名を足してください）: ${unmapped.join(', ')}\n`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 800 }, deviceScaleFactor: 1.5 });
let count = 0;
let bytes = 0;
const sections = [];
for (const [gi, g] of GROUPS.entries()) {
  const cards = [];
  for (const [label, name, to, when] of g.items) {
    const htmlPath = join(MAILS, `${label}.html`);
    if (!existsSync(htmlPath)) throw new Error(`missing ${label}`);
    const txt = readFileSync(join(MAILS, `${label}.txt`), 'utf8');
    const subject = txt.split('\n')[0].replace(/^件名:\s*/, '');
    const html = readFileSync(htmlPath, 'utf8');
    // 受信一覧の要約（プレビュー文）: 本文の先頭に隠して置かれた要素
    const pre = html.match(/display:\s*none[^>]*>([^<]{4,})</i)?.[1]?.trim() ?? '';
    const preText = decode(pre);
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    const buf = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 78 });
    bytes += buf.length;
    count += 1;
    cards.push(`
    <article class="mail" id="${label}">
      <header class="mail-head">
        <span class="no mono">${String(count).padStart(2, '0')}</span>
        <div class="mail-meta">
          <h3>${esc(name)}</h3>
          <dl>
            <div><dt>宛先</dt><dd>${esc(to)}</dd></div>
            <div><dt>タイミング</dt><dd>${esc(when)}</dd></div>
          </dl>
        </div>
      </header>
      <div class="inbox">
        <div class="subj">${esc(subject)}</div>
        ${preText ? `<div class="pre">${esc(preText)}</div>` : ''}
      </div>
      <div class="shot"><img alt="${esc(name)}のメール本文" src="data:image/jpeg;base64,${buf.toString('base64')}"></div>
    </article>`);
  }
  sections.push(`
  <section class="group" id="g${gi + 1}">
    <h2><span class="gno mono">${gi + 1}</span>${esc(g.title)}<span class="cnt">${g.items.length}通り</span></h2>
    <p class="intro">${esc(g.intro)}</p>
    <div class="grid">${cards.join('')}</div>
  </section>`);
}
await browser.close();

const toc = GROUPS.map((g, i) => `<a href="#g${i + 1}">${i + 1}. ${esc(g.title)}（${g.items.length}）</a>`).join('');
const tpl = readFileSync(TEMPLATE, 'utf8');
const out = tpl.replaceAll('{{COUNT}}', String(count)).replaceAll('{{BRANCH}}', esc(BRANCH)).replaceAll('{{DATE}}', esc(DATE)).replace('{{TOC}}', toc).replace('{{SECTIONS}}', sections.join('\n'));
writeFileSync(OUT, out);
process.stdout.write(`${count} mails, images ${(bytes / 1024 / 1024).toFixed(1)}MB\n`);
