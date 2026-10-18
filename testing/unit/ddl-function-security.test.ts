import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * DB の関数の正本（supabase/DDL/function/）の SECURITY DEFINER の決まり（supabase/DDL/README.md「関数の権限」）。
 * SECURITY DEFINER は所有者の権限で RLS を通らずに動くため、search_path の固定・実行の権限・呼び出し元の確認の
 * 書き忘れをここで止める。実DBの状態は schema.mjs --check で見る。
 */

const FUNCTION_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/DDL/function');

/** 呼び出し元を確かめる書き方（auth.uid() 等を直接使うか、それを使う共通の関数を呼ぶ） */
const CALLER_CHECK =
  /\bauth\.uid\(\)|\bauth\.jwt\(\)|\b(get_jwt_user_type|get_jwt_client_id|fn_assert_actor_or_admin|fn_assert_dual_actor_or_admin|get_monitor_client_id)\s*\(/i;

/** authenticated に実行させるが、呼び出し元を確かめない関数（関数名 → 理由） */
const UNCHECKED_CALLER: Record<string, string> = {};

interface DefinerFunction {
  file: string;
  name: string;
  /** CREATE から次の CREATE（またはファイルの末尾）までの本文 */
  body: string;
  /** REVOKE ... FROM の相手（小文字） */
  revokedFrom: string[];
  /** GRANT ... TO の相手（小文字） */
  grantedTo: string[];
}

function stripLineComments(sql: string): string {
  return sql.replace(/--.*$/gm, '');
}

function collectDefinerFunctions(): DefinerFunction[] {
  const result: DefinerFunction[] = [];
  for (const file of readdirSync(FUNCTION_DIR).filter((f) => f.endsWith('.sql'))) {
    const code = stripLineComments(readFileSync(path.join(FUNCTION_DIR, file), 'utf8'));
    const starts = [...code.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.]+)\s*\(/gi)];
    starts.forEach((match, i) => {
      const body = code.slice(match.index, starts[i + 1]?.index ?? code.length);
      // 本体（$$ 〜 $$）の外に SECURITY DEFINER がある関数だけを見る
      const outside = body
        .split('$$')
        .filter((_, j) => j % 2 === 0)
        .join(' ');
      if (!/SECURITY\s+DEFINER/i.test(outside)) return;
      const name = match[1].replace(/^\w+\./, '');
      const target = `ON\\s+FUNCTION\\s+[\\w.]*\\b${name}\\s*\\([^)]*\\)`;
      const revokedFrom = [
        ...code.matchAll(new RegExp(`REVOKE\\s+(?:EXECUTE|ALL)\\s+${target}\\s+FROM\\s+([^;]+);`, 'gi')),
      ]
        .flatMap((m) => m[1].toLowerCase().split(/\s*,\s*/))
        .map((s) => s.trim());
      const grantedTo = [...code.matchAll(new RegExp(`GRANT\\s+(?:EXECUTE|ALL)\\s+${target}\\s+TO\\s+([^;]+);`, 'gi'))]
        .flatMap((m) => m[1].toLowerCase().split(/\s*,\s*/))
        .map((s) => s.trim());
      result.push({ file, name: match[1], body, revokedFrom, grantedTo });
    });
  }
  return result;
}

const isTrigger = (f: DefinerFunction) => /RETURNS\s+trigger/i.test(f.body);
const functions = collectDefinerFunctions();

test('SECURITY DEFINER の関数は search_path を固定する', () => {
  assert.ok(functions.length > 80, `関数の検出数が少なすぎます（${functions.length}）`);
  const missing = functions.filter((f) => !/SET\s+search_path/i.test(f.body)).map((f) => `${f.file} ${f.name}`);
  assert.deepEqual(missing, []);
});

test('SECURITY DEFINER の関数は PUBLIC・anon から実行の権限を外し、anon に与えない', () => {
  const missing = functions
    .filter((f) => !isTrigger(f))
    .filter((f) => !f.revokedFrom.includes('public') || !f.revokedFrom.includes('anon') || f.grantedTo.includes('anon'))
    .map((f) => `${f.file} ${f.name}`);
  assert.deepEqual(missing, []);
});

test('authenticated が実行できる SECURITY DEFINER の関数は呼び出し元を確かめる', () => {
  const missing = functions
    .filter((f) => !isTrigger(f))
    .filter((f) => f.grantedTo.includes('authenticated') || !f.revokedFrom.includes('authenticated'))
    .filter((f) => !(f.name.replace(/^\w+\./, '') in UNCHECKED_CALLER) && !CALLER_CHECK.test(f.body))
    .map((f) => `${f.file} ${f.name}`);
  assert.deepEqual(missing, []);
});
