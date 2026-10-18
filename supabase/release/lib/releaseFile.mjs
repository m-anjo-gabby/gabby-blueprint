// supabase/release/lib/releaseFile.mjs
//
// リリーススクリプトのセクション分割と、適用履歴（ops.release_history）の読み取り。
// run.mjs（適用）と status.mjs（環境ごとのリリース状況）で共有する。

import { createHash } from 'node:crypto';

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * 「-- ====」行の直後の行に【追加セクション】を含む位置でファイルを分割する。
 * 先頭（最初の追加セクションより前）をセクション1とする。
 */
export function splitSections(sql) {
  const lines = sql.split(/\r?\n/);
  const starts = [0];
  for (let i = 1; i < lines.length; i++) {
    if (/^--\s*={10,}/.test(lines[i]) && lines[i + 1]?.includes('【追加セクション】')) starts.push(i);
  }
  return starts.map((start, idx) => {
    const end = starts[idx + 1] ?? lines.length;
    const body = lines.slice(start, end);
    const titleLine =
      idx === 0
        ? (body.find((l) => l.includes('対象ブランチ')) ?? body.find((l) => /^--\s*\S/.test(l) && !/={10,}/.test(l)))
        : body[1];
    const title = (titleLine ?? '')
      .replace(/^--\s*/, '')
      .replace('【追加セクション】', '')
      .trim();
    const posts = body.map((l) => l.match(/^--\s*@post:\s*(.+?)\s*$/)?.[1]).filter(Boolean);
    const sqlText = body.join('\n');
    return {
      no: idx + 1,
      title: idx === 0 ? `ファイル先頭 (${title})` : title,
      sql: sqlText,
      sha256: sha256(sqlText.trim()),
      posts,
    };
  });
}

export function lit(value) {
  return value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * 適用履歴を取得する（テーブル未作成＝run.mjs未使用の環境では空として扱う。読み取りのみ）。
 * file を省略した場合は全ファイル分を返す。
 */
export async function fetchHistory(query, file) {
  const [exists] = await query(`SELECT to_regclass('ops.release_history') IS NOT NULL AS ok;`);
  if (!exists?.ok) return [];
  const where = file ? `WHERE release_file = ${lit(file)} ` : '';
  return query(`SELECT release_file, section_no, section_sha256, step_type, command, status, applied_by, applied_at
FROM ops.release_history ${where}ORDER BY applied_at;`);
}

/** セクションごとの状態: pending / applied / changed（適用後に内容が変更された） */
export function sectionState(section, history) {
  const applied = history.filter(
    (h) => h.step_type === 'sql' && h.section_no === section.no && ['applied', 'marked'].includes(h.status),
  );
  if (applied.length === 0) return { state: 'pending' };
  const last = applied[applied.length - 1];
  return { state: last.section_sha256 === section.sha256 ? 'applied' : 'changed', last };
}
