'use client';

import { useState } from 'react';
import { ShellPageHeader } from '@/components/shell/ShellPage';
import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { CalendarMonthCard } from './CalendarMonthCard';

const noop = () => {};

/** 画面の見出し（page.tsx と loading.tsx で共有する） */
export function CalendarPageHeader() {
  return (
    <ShellPageHeader
      title="カレンダー"
      back="/live-room"
      description="個別セッションやグループセッション、お知らせなどの予定をまとめて確認できます。"
    />
  );
}

/**
 * カレンダー画面の読み込み中表示（loading.tsx 用）。
 * 見出しと今月の日付の枠は本物を描き、予定のチップだけが後から入る（CalendarBoard の読み込み中と同じ見た目）。
 */
export function CalendarSkeleton() {
  const [currentMonth] = useState(() => new Date());
  return (
    <RouteSkeleton>
      <CalendarPageHeader />
      <div className="space-y-6">
        <CalendarMonthCard
          currentMonth={currentMonth}
          itemsByDate={null}
          selectedDate={null}
          onSelectDate={noop}
          onPrev={noop}
          onNext={noop}
        />
      </div>
    </RouteSkeleton>
  );
}
