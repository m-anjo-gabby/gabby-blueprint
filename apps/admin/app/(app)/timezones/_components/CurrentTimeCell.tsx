'use client';

import { useLocale } from 'next-intl';
import { useCurrentMinute } from './useCurrentMinute';

interface CurrentTimeCellProps {
  timezone: string;
}

interface ZonedNow {
  dateTime: string;
  offset: string;
}

/**
 * 指定タイムゾーンの現在日時とUTCオフセットを整形する。
 * ブラウザのICUデータが該当IANA名を持たない場合は null を返す。
 */
function formatZonedNow(now: number, timezone: string, locale: string): ZonedNow | null {
  try {
    const dateTime = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(now);

    const offsetPart = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    })
      .formatToParts(now)
      .find((part) => part.type === 'timeZoneName')?.value;

    // 'GMT+09:00' → 'UTC+09:00'（UTC自体は 'GMT' のみが返る）
    const offset = !offsetPart || offsetPart === 'GMT' ? 'UTC+00:00' : offsetPart.replace('GMT', 'UTC');

    return { dateTime, offset };
  } catch {
    return null;
  }
}

export function CurrentTimeCell({ timezone }: CurrentTimeCellProps) {
  const locale = useLocale();
  const now = useCurrentMinute();
  const zoned = now === null ? null : formatZonedNow(now, timezone, locale);

  if (!zoned) {
    return <span className="text-slate-300">—</span>;
  }

  return (
    <div className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="text-slate-700 tabular-nums">{zoned.dateTime}</span>
      <span className="text-[11px] text-slate-400 font-mono">{zoned.offset}</span>
    </div>
  );
}
