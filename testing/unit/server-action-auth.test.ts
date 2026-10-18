import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * service_role（createAdminClient）を使う student・coach・共通のサーバーアクションは、ログイン中の利用者を
 * 確かめること（docs/SECURITY.md 2章）。サーバーアクションは公開の画面のパスからも呼べ、service_role は RLS を
 * 通らないため、確かめ忘れると未ログインの人にも実行できてしまう。admin は admin-action-guard.test.ts で見る。
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROOTS = ['apps/admin', 'apps/coach', 'apps/student', 'packages/lib'];

/** ログイン中の利用者を確かめる呼び出し */
const AUTH_CALL = /\b(getAuthUser|getCurrentUserWithType|requireAdminRole)\(/;

/** 利用者を確かめない関数（`ファイル#関数` → 理由） */
const UNCHECKED: Record<string, string> = {
  'packages/lib/calendarEvent/actions/calendarEventActions.ts#getCalendarEventMessageAttachmentUrlCore':
    '公開のバケットの URL を組み立てるだけ（service_role を使わない）',
  'packages/lib/monthlyReport/actions/monthlyReportActions.ts#getAdminCoachMonthlyReportCore':
    'admin のアクションから requireAdminRole の後でだけ呼ぶ（ADMIN_ONLY_CORE）',
  'packages/lib/monthlyReport/actions/monthlyReportActions.ts#approveCoachMonthlyReportCore':
    'admin のアクションから requireAdminRole の後でだけ呼ぶ（ADMIN_ONLY_CORE）',
  'packages/lib/monthlyReport/actions/monthlyReportActions.ts#revokeCoachMonthlyReportApprovalCore':
    'admin のアクションから requireAdminRole の後でだけ呼ぶ（ADMIN_ONLY_CORE）',
};

/** admin のアクションからだけ呼ぶ共通の処理。画面の部品から import すると、ブラウザから呼べる入口になる */
const ADMIN_ONLY_CORE = [
  'getAdminCoachMonthlyReportCore',
  'approveCoachMonthlyReportCore',
  'revokeCoachMonthlyReportApprovalCore',
];

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.next') return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [full] : [];
  });
}

interface ExportedFunction {
  key: string;
  body: string;
}

function collectExportedFunctions(file: string, source: string): ExportedFunction[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const relative = path.relative(REPO_ROOT, file).replaceAll('\\', '/');
  const result: ExportedFunction[] = [];
  for (const statement of sf.statements) {
    const isExported = ts.canHaveModifiers(statement)
      ? (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      : false;
    if (!isExported) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      result.push({ key: `${relative}#${statement.name.text}`, body: statement.body?.getText(sf) ?? '' });
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          result.push({ key: `${relative}#${declaration.name.getText(sf)}`, body: init.body.getText(sf) });
        }
      }
    }
  }
  return result;
}

const files = ROOTS.flatMap((root) => listSourceFiles(path.join(REPO_ROOT, root))).map((file) => ({
  file,
  source: readFileSync(file, 'utf8'),
}));
const actionFiles = files.filter(
  ({ file, source }) =>
    !path.relative(REPO_ROOT, file).startsWith(path.join('apps', 'admin')) &&
    !file.endsWith('.tsx') &&
    /^'use server'/m.test(source) &&
    /\bcreateAdminClient\b/.test(source),
);
const actions = actionFiles.flatMap(({ file, source }) => collectExportedFunctions(file, source));

test('service_role を使うサーバーアクションはログイン中の利用者を確かめる', () => {
  assert.ok(actions.length > 20, `アクションの検出数が少なすぎます（${actions.length}）`);
  const missing = actions.filter((a) => !(a.key in UNCHECKED) && !AUTH_CALL.test(a.body)).map((a) => a.key);
  assert.deepEqual(missing, []);
});

test('利用者を確かめない一覧の関数は実在し、確かめていない', () => {
  for (const key of Object.keys(UNCHECKED)) {
    const action = actions.find((a) => a.key === key);
    assert.ok(action, `${key} が見つかりません（一覧から外してください）`);
    assert.ok(!AUTH_CALL.test(action.body), `${key} は確かめるようになりました（一覧から外してください）`);
  }
});

test('admin 専用の共通の処理を画面の部品から import しない', () => {
  const clientFiles = files.filter(({ source }) => /^'use client'/m.test(source));
  const imported = clientFiles.flatMap(({ file, source }) =>
    ADMIN_ONLY_CORE.filter((name) => new RegExp(`\\b${name}\\b`).test(source)).map(
      (name) => `${path.relative(REPO_ROOT, file)}: ${name}`,
    ),
  );
  assert.deepEqual(imported, []);
});
