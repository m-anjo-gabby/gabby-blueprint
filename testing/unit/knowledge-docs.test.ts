import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * 書き足して溜まる記録（スキルの HISTORY.md・CV辞書の判断基準ガイド）が育ちすぎないように、件数・行数の上限を検査する。
 * 上限を超えたら、各ファイル冒頭の決まりに従って古い記録を消す・規約へ移す（テスト判断基準ガイドは judgement-guide.test.ts）。
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKILLS_DIR = path.join(REPO_ROOT, '.claude/skills');
/** HISTORY.md の1節あたりの日付つきの記録（表の行・箇条書き）の上限 */
const MAX_ENTRIES_PER_SECTION = 10;
const CV_GUIDE = path.join(REPO_ROOT, 'docs/cv-dictionary/JUDGEMENT-GUIDE.md');
const CV_GUIDE_MAX_LINES = 300;

const historyFiles = readdirSync(SKILLS_DIR)
  .map((skill) => path.join(SKILLS_DIR, skill, 'HISTORY.md'))
  .filter((file) => existsSync(file));

test('スキルの HISTORY.md がある', () => {
  assert.ok(historyFiles.length > 0);
});

test(`スキルの HISTORY.md の各節の記録は ${MAX_ENTRIES_PER_SECTION} 件以内`, () => {
  const over = historyFiles.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split(/^## /m)
      .slice(1)
      .map((section) => ({
        title: section.split('\n')[0].trim(),
        entries: section.split('\n').filter((line) => /^(\| |- )20\d\d-\d\d-\d\d/.test(line)).length,
      }))
      .filter((s) => s.entries > MAX_ENTRIES_PER_SECTION)
      .map((s) => `${path.relative(REPO_ROOT, file)}「${s.title}」: ${s.entries} 件`),
  );
  assert.deepEqual(over, []);
});

test(`CV辞書の判断基準ガイドは ${CV_GUIDE_MAX_LINES} 行以内`, () => {
  const lines = readFileSync(CV_GUIDE, 'utf8').split('\n').length;
  assert.ok(lines <= CV_GUIDE_MAX_LINES, `${lines} 行あります。冒頭の「事例の育て方」に従って棚卸ししてください`);
});
