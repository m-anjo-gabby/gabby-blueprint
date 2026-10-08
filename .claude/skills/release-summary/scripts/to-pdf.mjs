#!/usr/bin/env node
// 変更概要資料（アーティファクト用のHTML）を、配布用のA4のPDFにする。
// 使い方: node .claude/skills/release-summary/scripts/to-pdf.mjs <資料.html> [--out=<資料.pdf>]
// - アーティファクトのHTMLは <html>/<head>/<body> を持たない（公開時に付く）ため、ここで同じ骨組みで包む。
// - 改ページの調整は template.html の @media print / @page で行う（このスクリプトでは触らない）。
// - Playwright は testing/ の依存を使う（リポジトリルートで pnpm install 済みであること）。
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--'));
if (!input) {
  process.stderr.write('usage: to-pdf.mjs <file.html> [--out=<file.pdf>]\n');
  process.exit(1);
}
const output = args.find((a) => a.startsWith('--out='))?.slice('--out='.length) ?? input.replace(/\.html?$/i, '') + '.pdf';

const require = createRequire(resolve('testing/package.json'));
const { chromium } = require('@playwright/test');

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${readFileSync(input, 'utf8')}</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.emulateMedia({ media: 'print', colorScheme: 'light' });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: output,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#8d8676;text-align:center;font-family:sans-serif"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });
  process.stdout.write(`wrote ${output}\n`);
} finally {
  await browser.close();
}
