'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  formatTimeInZone,
  formatUtcOffset,
  getDeviceTimezone,
  hasTimezoneMismatch,
} from '../_lib/timezoneMismatch';

/** 「このままにする」を選んだ「設定|端末」の組み合わせ（端末ごとの表示設定） */
const DISMISSED_KEY = 'gabby.student.timezoneMismatchDismissed';

const readDismissed = (): string | null => {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
};

const writeDismissed = (value: string) => {
  try {
    window.localStorage.setItem(DISMISSED_KEY, value);
  } catch {
    // 保存できない環境（プライベートブラウズ等）では、今回の表示だけ閉じる
  }
};

const formatToday = (nowMs: number, timeZone: string) =>
  new Intl.DateTimeFormat('ja-JP', { timeZone, month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(nowMs));

interface TodayDateLineProps {
  nowMs: number;
  /** 日付の表示に使うタイムゾーン */
  timezone: string;
  /** プロフィールのタイムゾーン設定（ユーザー情報の読み込み前は null。その間はずれを判定しない） */
  settingTimezone: string | null;
  /** タイムゾーンマスタの表示名（IANA名 → 日本語名） */
  timezoneNames: Record<string, string>;
}

/**
 * ホームの日付行。
 * タイムゾーン設定と端末の時刻がずれている場合だけ警告アイコンを添え、
 * タップで内容とプロフィール設定への導線をポップオーバーで表示する。
 * useNow が値を返した後（クライアント側）にだけ描画される前提のため、端末情報を描画中に読んでよい。
 */
export function TodayDateLine({ nowMs, timezone, settingTimezone, timezoneNames }: TodayDateLineProps) {
  const [deviceTimezone] = useState(getDeviceTimezone);
  const [dismissed, setDismissed] = useState(readDismissed);
  const today = formatToday(nowMs, timezone);

  const pairKey = settingTimezone && deviceTimezone ? `${settingTimezone}|${deviceTimezone}` : null;
  const showWarning =
    pairKey !== null &&
    dismissed !== pairKey &&
    hasTimezoneMismatch(settingTimezone!, deviceTimezone!, nowMs);

  if (!showWarning) return <p className="text-sm text-ink-muted">{today}</p>;

  const handleDismiss = () => {
    writeDismissed(pairKey);
    setDismissed(pairKey);
  };

  // 設定側はマスタから選ばれた値なのでマスタの名称、端末側はマスタに無い地域もあり得るためUTC時差の固定表記で示す
  const rows = [
    { label: 'タイムゾーン設定', name: timezoneNames[settingTimezone!] ?? settingTimezone!, zone: settingTimezone! },
    { label: 'お使いの端末', name: formatUtcOffset(deviceTimezone!, nowMs) ?? deviceTimezone!, zone: deviceTimezone! },
  ];

  return (
    <Popover>
      <PopoverTrigger
        className="-mx-1 inline-flex items-center gap-1.5 rounded-control px-1 text-sm text-ink-muted hover:text-ink transition-colors"
        aria-label={`${today}（端末の時刻とタイムゾーン設定が異なります）`}
      >
        {today}
        <AlertTriangle size={14} className="text-amber-500" aria-hidden />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] rounded-card border-line bg-white p-5">
        <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <AlertTriangle size={16} className="shrink-0 text-amber-500" aria-hidden />
          端末の時刻とタイムゾーン設定が異なります
        </p>

        <dl className="mt-3 divide-y divide-line/60 rounded-control border border-line/70">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="shrink-0 text-xs text-ink-muted">{row.label}</dt>
              <dd className="min-w-0 text-right">
                <span className="block truncate text-xs font-bold text-ink-soft">{row.name}</span>
                <span className="block text-xs text-ink-muted tabular-nums">{formatTimeInZone(nowMs, row.zone)}</span>
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          ライブセッションの時刻やトレーニングの日付は、タイムゾーン設定の時刻で表示されます。
        </p>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleDismiss} className="rounded-control text-ink-muted">
            このままにする
          </Button>
          <Button asChild size="sm" className="rounded-control bg-brand font-bold text-white hover:bg-brand-strong">
            <Link href="/profile">プロフィールで変更する</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
