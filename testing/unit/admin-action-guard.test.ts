import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * admin のサーバーアクションは、どれも先頭で requireAdminRole を呼ぶこと（apps/admin/lib/adminAuth.ts）。
 * サーバーアクションはどの画面からでも呼べ、多くは service_role で RLS を通らないため、付け忘れをここで止める。
 */

const ACTIONS_DIR = new URL('../../apps/admin/actions/', import.meta.url);

/** ロールを確かめないアクションのファイル（理由つき） */
const UNGUARDED_FILES: Record<string, string> = {
  'adminAuthAction.ts': 'ログイン・パスワード再設定等の認証そのもの（未ログインで使う）',
  'localeAction.ts': '表示言語の Cookie を設定するだけ（ログイン画面でも使う）',
};

interface ExportedAction {
  file: string;
  name: string;
  firstStatement: string;
}

function collectExportedActions(file: string): ExportedAction[] {
  const source = readFileSync(new URL(file, ACTIONS_DIR), 'utf8');
  if (!/^'use server'/m.test(source)) return [];
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const actions: ExportedAction[] = [];
  const add = (name: string, body: ts.ConciseBody | undefined) => {
    const first = body && ts.isBlock(body) ? body.statements[0] : undefined;
    actions.push({ file, name, firstStatement: first?.getText(sf) ?? '' });
  };
  for (const statement of sf.statements) {
    const isExported = ts.canHaveModifiers(statement)
      ? (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      : false;
    if (!isExported) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      add(statement.name.text, statement.body);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          add(declaration.name.getText(sf), init.body);
        }
      }
    }
  }
  return actions;
}

const files = readdirSync(ACTIONS_DIR).filter((f) => f.endsWith('.ts'));

test('admin のサーバーアクションは先頭でロールを確かめる', () => {
  const actions = files.filter((f) => !(f in UNGUARDED_FILES)).flatMap(collectExportedActions);
  assert.ok(actions.length > 100, `アクションの検出数が少なすぎます（${actions.length}）`);
  const missing = actions
    .filter((a) => !/^(const \{ id: \w+ \} = )?await requireAdminRole\(/.test(a.firstStatement))
    .map((a) => `${a.file} ${a.name}`);
  assert.deepEqual(missing, []);
});

test('ロールを確かめない一覧のファイルは実在する', () => {
  for (const file of Object.keys(UNGUARDED_FILES)) assert.ok(files.includes(file), file);
});
