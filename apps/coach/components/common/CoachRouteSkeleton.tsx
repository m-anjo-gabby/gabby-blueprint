'use client';

import { usePathname } from 'next/navigation';
import { RouteLoading } from '@/components/common/RouteLoading';
import { InboxPageSkeleton } from '@/components/common/InboxPageParts';
import {
  AvailabilitySkeleton,
  MonthlyReportsSkeleton,
  ProfileRouteSkeleton,
  RequestsSkeleton,
} from '@/components/common/ToolPageSkeletons';
import { DashboardSkeleton } from '@/app/(app)/dashboard/_components/DashboardLayout';
import { CalendarSkeleton } from '@/app/(app)/calendar/_components/CalendarSkeleton';
import { StudentsRouteSkeleton } from '@/app/(app)/students/_components/StudentsRouteSkeleton';

/**
 * アプリ全体（(app)/loading.tsx）の読み込み中表示。
 * ページを直接開いた・再読み込みした直後は、最初に最も外側の loading.tsx が表示されるため、
 * ここでも表示中のパスで各画面と同じ骨組みを出す（汎用の骨組み→画面の骨組み→本番、の2段の切り替えを避ける。
 * 特にライブセッション中のセッションハブ等の再読み込みで、Header/Sidebar 付きの汎用の骨組みを挟まない）。
 * 各画面のフォルダの loading.tsx と同じ部品を使う。画面を追加したらここにも加える。
 */
export function CoachRouteSkeleton() {
  const pathname = usePathname();
  const top = pathname.split('/')[1] ?? '';

  switch (top) {
    case 'dashboard':
      return <DashboardSkeleton />;
    case 'students':
      return <StudentsRouteSkeleton />;
    case 'calendar':
      return <CalendarSkeleton />;
    case 'availability':
      return <AvailabilitySkeleton />;
    case 'matching-requests':
      return <RequestsSkeleton />;
    case 'monthly-reports':
      return <MonthlyReportsSkeleton />;
    case 'profile':
      return <ProfileRouteSkeleton />;
    case 'notice':
      return <InboxPageSkeleton page="notice" />;
    case 'notification':
      return <InboxPageSkeleton page="notification" />;
    case 'chat':
      return <RouteLoading variant="chat" />;
    default:
      return <RouteLoading variant="cards" />;
  }
}
