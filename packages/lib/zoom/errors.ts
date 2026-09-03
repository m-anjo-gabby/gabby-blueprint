/**
 * @zoom/videosdkのエラーは通常のErrorとは限らず、{type, reason, errorCode}形式
 * （ExecutedFailure）で返ることがある。素の値をログ/UIにそのまま渡すと
 * （特にNext.jsの開発者オーバーレイやconsole.error経由では）中身が「{}」や
 * 「[object Object]」に潰れて見えるため、name/message/reasonを明示的に取り出す。
 */
export function describeZoomError(err: unknown): { detail: unknown; message: string } {
  if (err instanceof Error) {
    return { detail: { name: err.name, message: err.message }, message: err.message || err.name };
  }
  if (err && typeof err === 'object') {
    const e = err as { type?: string; reason?: string; errorCode?: number };
    if (e.type || e.reason) {
      return { detail: e, message: [e.type, e.reason].filter(Boolean).join(': ') || 'Unknown error' };
    }
  }
  return { detail: err, message: 'Unknown error' };
}
