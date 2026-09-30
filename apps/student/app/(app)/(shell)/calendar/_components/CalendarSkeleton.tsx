'use client';

import { ShellPageHeader } from '@/components/shell/ShellPage';
import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { useUrlMonth } from '@/lib/useUrlMonth';
import { CalendarBoard } from './CalendarBoard';

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
 * 見出しと表示月（?month=、無ければ利用者のタイムゾーンでの今月）の日付の枠は本物を描き、予定のチップだけが後から入る
 * （page.tsx の月ごとの Suspense の fallback と同じ、データ無しの CalendarBoard）。
 */
export function CalendarSkeleton() {
  const month = useUrlMonth();
  return (
    <RouteSkeleton>
      <CalendarPageHeader />
      <CalendarBoard month={month} initialSessions={null} initialEvents={null} bookableSlots={null} />
    </RouteSkeleton>
  );
}
