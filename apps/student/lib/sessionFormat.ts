/** ライブセッション枠の表示用日時（「9月30日(火)」「19:00〜19:25」、指定タイムゾーン） */
export function formatSessionSlot(startIso: string, endIso: string, timeZone: string): { date: string; time: string } {
  const dateFormat = new Intl.DateTimeFormat('ja-JP', { timeZone, month: 'long', day: 'numeric', weekday: 'short' });
  const timeFormat = new Intl.DateTimeFormat('ja-JP', { timeZone, hour: '2-digit', minute: '2-digit' });
  return {
    date: dateFormat.format(new Date(startIso)),
    time: `${timeFormat.format(new Date(startIso))}〜${timeFormat.format(new Date(endIso))}`,
  };
}
