import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * サーバー側のコードの catch は、先頭で unstable_rethrow を呼ぶこと（docs/CODING.md「catch」）。
 * Next の制御用のエラー（redirect・notFound・動的な描画の判定）を catch で飲み込むと、遷移が止まったり、
 * ビルド時にエラーのログが出たりするため、付け忘れをここで止める。
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROOTS = ['apps/admin', 'apps/coach', 'apps/student', 'packages/lib'];

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.next') return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [full] : [];
  });
}

/** サーバーだけで動くファイルか（ブラウザでも動くファイルには Next の制御用のエラーが届かない） */
function isServerFile(file: string, source: string): boolean {
  if (/^['"]use client['"]/m.test(source)) return false;
  if (/^['"]use server['"]/m.test(source) || /import ['"]server-only['"]/.test(source)) return true;
  if (/[\\/]app[\\/]/.test(file)) return true;
  return /from ['"](next\/headers|[./@a-z/]*supabase\/(server|admin|authUser)|\.\.?\/(server|admin|authUser))['"]/.test(
    source,
  );
}

test('サーバー側のコードの catch は先頭で unstable_rethrow を呼ぶ', () => {
  const missing: string[] = [];
  let checked = 0;
  for (const root of ROOTS) {
    for (const file of listSourceFiles(path.join(REPO_ROOT, root))) {
      const source = readFileSync(file, 'utf8');
      if (!isServerFile(file, source)) continue;
      const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
      const visit = (node: ts.Node) => {
        if (ts.isCatchClause(node)) {
          checked++;
          const first = node.block.statements[0];
          if (!first || !/^unstable_rethrow\(/.test(first.getText(sf))) {
            const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
            missing.push(`${path.relative(REPO_ROOT, file)}:${line}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }
  assert.ok(checked > 200, `catch の検出数が少なすぎます（${checked}）`);
  assert.deepEqual(missing, []);
});
