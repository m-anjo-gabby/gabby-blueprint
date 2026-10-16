/**
 * 利用者が入力した検索語を、Supabase（PostgREST）の部分一致検索の条件に安全に埋め込むための関数。
 *
 * - LIKE の特殊文字（`%` `_` `\`）はエスケープし、入力した文字そのものとして検索する。
 * - `.or()` に渡す条件は値をダブルクォートで囲み、入力中の `,` `(` `)` `"` `\` が
 *   条件の区切りとして解釈されない（他の条件を書き換えられない）ようにする。
 */

/** LIKE の特殊文字をエスケープする */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

/** `.ilike(column, pattern)` 用の「部分一致」パターン */
export function containsPattern(term: string): string {
  return `%${escapeLike(term)}%`;
}

/**
 * 複数の列のどれかに部分一致する `.or()` 用の条件。
 * 例: `query.or(ilikeAny(['user_name', 'email'], q))`
 */
export function ilikeAny(columns: readonly string[], term: string): string {
  const quoted = `"${containsPattern(term).replace(/[\\"]/g, '\\$&')}"`;
  return columns.map((column) => `${column}.ilike.${quoted}`).join(',');
}
