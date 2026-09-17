// apps/coach/lib/liveSession/context.ts
//
// セッションハブ（.../sessions/[sessionId]）発のライブセッション文脈を扱うための共通ユーティリティ。
// Live Sprint・将来のDialog Practice等、ハブから起動するトレーニングコンテンツ画面はすべて
// ここを経由して「没入表示すべきか」「ハブへどう戻るか」を判定する。
//
// この文脈は record.session_id（実施記録が過去に属していたセッション）とは別物で、
// あくまで「今まさにハブから遷移してきて、通話中に操作している最中か」を表す。
// その判定基準はURLの?session_id=の有無に統一する。

/**
 * トレーニングコンテンツ画面が、ハブ発のライブセッション文脈内で開かれているかどうかを判定する。
 * TypeScriptの型ガードとして使うことで、真の場合はsessionIdがstringに絞り込まれる。
 */
export function isLiveSessionContext(sessionId: string | null): sessionId is string {
  return !!sessionId;
}

/** セッションハブ画面へのURL */
export function buildLiveSessionHubHref(studentId: string, sessionId: string): string {
  return `/students/${studentId}/sessions/${sessionId}`;
}

/**
 * ライブセッション文脈内でのコンテンツ間遷移用に、?session_id=を付与したURLを組み立てる。
 * sessionIdがnull（ハブ発でない単独実施・履歴からの参照）の場合はhrefをそのまま返す。
 */
export function withLiveSessionParam(href: string, sessionId: string | null): string {
  if (!sessionId) return href;
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}session_id=${sessionId}`;
}
