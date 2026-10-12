/**
 * メールのヘッダーに載せるロゴ（apps/student/public/mail-logo.png）を、アプリのロゴ画像から作り直す。
 * メールからは本番の生徒ポータルの URL で参照する（packages/lib/mail/assets/logo.ts）。表示サイズを変える場合は logo.ts も合わせる。
 * 実行: node scripts/mail-logo/build.mjs
 *
 * - 透過を白で埋める（ダークモードのメールで透過部分の色が変わり、青い文字が読みにくくなるのを防ぐ）
 * - 周りに白い余白を付け、表示サイズ（MAIL_LOGO_WIDTH × MAIL_LOGO_HEIGHT）の2倍で書き出す（高解像度の画面向け）
 * - 減色して容量を抑える（メールを開くたびに読み込まれるため）
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// sharp は Next.js の依存（画像最適化用）として入っているものを使う
const nextPackage = createRequire(path.join(ROOT, 'apps/student/package.json')).resolve('next/package.json');
const sharp = createRequire(nextPackage)('sharp');

const SOURCE = path.join(ROOT, 'apps/student/public/logo-01.png');
const OUTPUT = path.join(ROOT, 'apps/student/public/mail-logo.png');
/** メール上の表示サイズ（px。packages/lib/mail/assets/logo.ts の MAIL_LOGO_WIDTH / MAIL_LOGO_HEIGHT と同じ） */
const DISPLAY_WIDTH = 180;
const DISPLAY_HEIGHT = 60;
/** ロゴの周りの余白（表示上の px） */
const PADDING = 6;

const scale = 2;
const trimmed = await sharp(SOURCE).flatten({ background: '#ffffff' }).trim({ background: '#ffffff', threshold: 10 }).toBuffer();
const png = await sharp(trimmed)
  .resize({
    width: (DISPLAY_WIDTH - PADDING * 2) * scale,
    height: (DISPLAY_HEIGHT - PADDING * 2) * scale,
    fit: 'contain',
    background: '#ffffff',
  })
  .extend({ top: PADDING * scale, bottom: PADDING * scale, left: PADDING * scale, right: PADDING * scale, background: '#ffffff' })
  .png({ palette: true, colours: 64, compressionLevel: 9 })
  .toBuffer();

writeFileSync(OUTPUT, png);
console.log(`wrote ${path.relative(ROOT, OUTPUT)} (${png.length} bytes)`);
