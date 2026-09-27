/** ライブセッション枠の表示用日時（「9月30日(火)」「19:00〜19:25」、指定タイムゾーン） */
export function formatSessionSlot(startIso: string, endIso: string, timeZone: string): { date: string; time: string } {
  const dateFormat = new Intl.DateTimeFormat('ja-JP', { timeZone, month: 'long', day: 'numeric', weekday: 'short' });
  const timeFormat = new Intl.DateTimeFormat('ja-JP', { timeZone, hour: '2-digit', minute: '2-digit' });
  return {
    date: dateFormat.format(new Date(startIso)),
    time: `${timeFormat.format(new Date(startIso))}〜${timeFormat.format(new Date(endIso))}`,
  };
}

/** 指定時刻までの残り時間を「3日」「5時間」「20分」の形で表す（過ぎていれば null） */
export function formatTimeUntil(targetIso: string, nowMs: number): string | null {
  const diffMinutes = Math.floor((new Date(targetIso).getTime() - nowMs) / 60000);
  if (diffMinutes < 0) return null;
  if (diffMinutes < 60) return `${Math.max(diffMinutes, 1)}分`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}時間`;
  return `${Math.floor(diffHours / 24)}日`;
}
