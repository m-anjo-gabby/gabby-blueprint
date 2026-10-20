/** 再生時間の表示（m:ss。1時間以上は h:mm:ss。未計測は '-'） */
export function formatVideoDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec) || sec < 0) return '-';
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
