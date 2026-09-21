'use client';

import type { ComponentType } from 'react';
import { Sunrise, Sun, Sunset, Moon } from 'lucide-react';
import { cn } from '../../utils';
import { getHourInZone, getTimeOfDayCategory, isInconsiderateHour, type TimeOfDayCategory } from '../../date/date';

const TIME_OF_DAY_ICONS: Record<TimeOfDayCategory, ComponentType<{ size?: number; className?: string }>> = {
  morning: Sunrise,
  day: Sun,
  evening: Sunset,
  night: Moon,
};

export interface CounterpartLocalTimeProps {
  /** 表示対象のUTC ISO日時（未選択時はnull/undefinedでよい） */
  datetime: string | null | undefined;
  /** 相手のIANAタイムゾーン */
  timezone: string | null | undefined;
  /** ラベル文言（例: "コーチの現地時間" / "Student's local time"） */
  label: string;
  /** 深夜早朝帯(22:00-6:59)に該当する場合に添える注記文言（例: "相手にとって深夜の時間帯です"） */
  cautionText?: string;
  /** 日時のフォーマッター（呼び出し側の言語・タイムゾーン表示規約に合わせて注入する） */
  format: (datetime: string, timezone: string) => string;
  className?: string;
}

/**
 * 予約・キャンセル振替候補の日時選択後に、相手（コーチ⇔生徒）のタイムゾーンでの開始日時を
 * 朝/昼/夕/夜のアイコン付きで表示する共通バッジ（ポータル共通）。
 * 相手にとって深夜早朝にあたる時間帯は、視覚的に気づけるよう強調表示する。
 * 文言・フォーマットは一切ハードコードせず、すべて呼び出し側から注入する。
 */
export function CounterpartLocalTime({ datetime, timezone, label, cautionText, format, className }: CounterpartLocalTimeProps) {
  if (!datetime || !timezone) return null;
  if (isNaN(new Date(datetime).getTime())) return null;

  const hour = getHourInZone(datetime, timezone);
  const category = getTimeOfDayCategory(hour);
  const Icon = TIME_OF_DAY_ICONS[category];
  const caution = isInconsiderateHour(hour);

  return (
    <p
      className={cn(
        'flex flex-wrap items-center gap-1.5 text-[11px] font-semibold rounded-md border px-2 py-1 w-fit',
        caution ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-slate-500 bg-slate-50 border-slate-100',
        className
      )}
    >
      <Icon size={13} className="shrink-0" />
      <span>
        {label}: {format(datetime, timezone)}
      </span>
      {caution && cautionText && <span>({cautionText})</span>}
    </p>
  );
}
