'use client';

import { useEffect, useMemo, useState } from 'react';
import { Globe, Loader2, Clock } from 'lucide-react';
import { TimezoneMaster } from '@gabby/types/timezone';

export interface TimezoneSelectorLabels {
  /** フィールドラベル */
  label: string;
  /** 選択中タイムゾーンの現在日時表示のプレフィックス（例: '現在の日時' / 'Current time'） */
  currentTimeLabel: string;
}

export interface TimezoneSelectorProps {
  /** 現在選択中のIANAタイムゾーン名 */
  value: string;
  /** 選択肢一覧（com_m_timezoneマスタ） */
  timezones: TimezoneMaster[];
  /** 選択変更時に呼び出される更新処理（サーバーアクション呼び出しは呼び出し側の責務） */
  onChange: (timezone: string) => Promise<void>;
  /** 表示名に使用する項目（日本語UIアプリはja、英語UIアプリ（coach）はen） */
  displayField?: 'display_name_ja' | 'display_name_en';
  /** UI表示文言（言語はポータル側で決定するため、ここでは受け取るだけ） */
  labels: TimezoneSelectorLabels;
  disabled?: boolean;
}

/** IANAタイムゾーン名から "UTC+09:00" 形式のオフセット文字列を算出する（DSTも考慮） */
function getUtcOffsetLabel(timezone: string, date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    }).formatToParts(date);
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    if (!raw) return '';
    return raw === 'GMT' ? 'UTC+00:00' : raw.replace('GMT', 'UTC');
  } catch {
    return '';
  }
}

/**
 * タイムゾーン選択用の共通UIコンポーネント（ポータル共通）
 * 実際の更新処理（サーバーアクション呼び出し・ストア更新・トースト表示）は
 * onChange として呼び出し側から注入する（本コンポーネントはDBの詳細を一切知らない）。
 * 選択肢にはIANA名の代わりにUTCオフセットを併記し、選択中タイムゾーンの現在日時をリアルタイム表示する。
 */
export function TimezoneSelector({
  value,
  timezones,
  onChange,
  displayField = 'display_name_ja',
  labels,
  disabled = false,
}: TimezoneSelectorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // 選択中タイムゾーンの現在日時表示・DST跨ぎのオフセット表示を追随させるための定期更新
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const locale = displayField === 'display_name_en' ? 'en-US' : 'ja-JP';

  const options = useMemo(
    () => timezones.map((tz) => ({ ...tz, offsetLabel: getUtcOffsetLabel(tz.timezone, now) })),
    [timezones, now]
  );

  const currentTimeLabel = useMemo(() => {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat(locale, {
        timeZone: value,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(now);
    } catch {
      return '';
    }
  }, [locale, value, now]);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (!next || next === value) return;
    setIsSaving(true);
    try {
      await onChange(next);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        <Globe size={13} /> {labels.label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={handleChange}
          disabled={disabled || isSaving}
          className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 pr-9 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-60 disabled:cursor-not-allowed appearance-none"
        >
          {options.map((tz) => (
            <option key={tz.timezone} value={tz.timezone}>
              {tz[displayField]} {tz.offsetLabel}
            </option>
          ))}
        </select>
        {isSaving && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400 pointer-events-none" />
        )}
      </div>
      {currentTimeLabel && (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Clock size={11} /> {labels.currentTimeLabel}: {currentTimeLabel}
        </p>
      )}
    </div>
  );
}
