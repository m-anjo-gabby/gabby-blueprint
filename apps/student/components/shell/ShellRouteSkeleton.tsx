'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ContentFrame, type ContentWidth } from './PageFrames';
import { AppShell } from './AppShell';
import { ImmersiveLoading, RouteLoading } from './RouteLoading';
import { isImmersivePath, isTrainingSectionPath } from '@/constants/navigation';
import { TrainingSectionNav } from './TrainingSectionNav';
import { SHELL_CONTENT_WIDTH } from '@/constants/shellLayout';
import { HomeSkeleton } from '@/app/(app)/(shell)/dashboard/_components/HomeSkeleton';
import { LibrarySkeleton } from '@/app/(app)/(shell)/library/_components/LibrarySkeleton';
import { FavoritesSkeleton } from '@/app/(app)/(shell)/favorites/_components/FavoritesSkeleton';
import { CalendarSkeleton } from '@/app/(app)/(shell)/calendar/_components/CalendarSkeleton';
import { CoachMatchingSkeleton } from '@/app/(app)/(shell)/coach-matching/_components/CoachMatchingSkeleton';
import { MonitorSkeleton } from '@/app/(app)/(shell)/monitor/_components/MonitorSkeleton';
import { NoticeRouteSkeleton } from '@/app/(app)/(shell)/notice/_components/NoticeSkeleton';
import { NotificationRouteSkeleton } from '@/app/(app)/(shell)/notification/_components/NotificationSkeleton';
import { ProfileRouteSkeleton } from '@/app/(app)/(shell)/profile/_components/ProfileSkeleton';
import { LiveRoomRouteSkeleton } from '@/app/(app)/(shell)/live-room/_components/LiveRoomSkeleton';
import { TrainingPerformanceSkeleton } from '@/app/(app)/(shell)/training/performance/_components/TrainingPerformanceSkeleton';
import { WordHistorySkeleton } from '@/app/(app)/(shell)/training/word/history/_components/WordHistorySkeleton';
import { SprintHistoryRouteSkeleton } from '@/app/(app)/(shell)/training/sprint/history/_components/SprintHistoryRouteSkeleton';
import { DialogueSkeleton } from '@/app/(app)/(shell)/training/dialogue/_components/DialogueSkeleton';
import { GroupSessionsSkeleton } from '@/app/(app)/(shell)/group-sessions/_components/GroupSessionsSkeleton';

/** 表示中のパスに対応する、シェル内の画面の枠の幅と骨組み（各画面のフォルダの loading.tsx と同じ部品） */
function resolveShellSkeleton(pathname: string): { width: ContentWidth; skeleton: ReactNode } | 'chat' | null {
  const [, first, second, third] = pathname.split('/');
  switch (first) {
    case 'dashboard':
      return { width: SHELL_CONTENT_WIDTH.dashboard, skeleton: <HomeSkeleton /> };
    case 'library':
      return { width: SHELL_CONTENT_WIDTH.library, skeleton: <LibrarySkeleton /> };
    case 'favorites':
      return { width: SHELL_CONTENT_WIDTH.favorites, skeleton: <FavoritesSkeleton /> };
    case 'calendar':
      return { width: SHELL_CONTENT_WIDTH.calendar, skeleton: <CalendarSkeleton /> };
    case 'coach-matching':
      return { width: SHELL_CONTENT_WIDTH.coachMatching, skeleton: <CoachMatchingSkeleton /> };
    case 'monitor':
      return { width: SHELL_CONTENT_WIDTH.monitor, skeleton: <MonitorSkeleton /> };
    case 'group-sessions':
      return { width: SHELL_CONTENT_WIDTH.groupSessions, skeleton: <GroupSessionsSkeleton /> };
    case 'notice':
      return { width: SHELL_CONTENT_WIDTH.notice, skeleton: <NoticeRouteSkeleton /> };
    case 'notification':
      return { width: SHELL_CONTENT_WIDTH.notification, skeleton: <NotificationRouteSkeleton /> };
    case 'profile':
      return { width: SHELL_CONTENT_WIDTH.profile, skeleton: <ProfileRouteSkeleton /> };
    case 'live-room':
      return { width: SHELL_CONTENT_WIDTH.liveRoom, skeleton: <LiveRoomRouteSkeleton /> };
    case 'chat':
      return 'chat';
    case 'training':
      if (second === 'performance') return { width: SHELL_CONTENT_WIDTH.trainingPerformance, skeleton: <TrainingPerformanceSkeleton /> };
      if (second === 'word' && third === 'history') return { width: SHELL_CONTENT_WIDTH.wordHistory, skeleton: <WordHistorySkeleton /> };
      if (second === 'sprint' && third === 'history') return { width: SHELL_CONTENT_WIDTH.sprintHistory, skeleton: <SprintHistoryRouteSkeleton /> };
      if (second === 'dialogue') return { width: SHELL_CONTENT_WIDTH.dialogue, skeleton: <DialogueSkeleton /> };
      return null;
    default:
      return null;
  }
}

/**
 * シェル内の画面の読み込み中表示（(shell)/loading.tsx 用）。
 * ページを直接開いた・再読み込みした直後は最も外側の loading.tsx が先に出るため、ここでも表示中のパスから
 * 各画面と同じ枠の幅・骨組みを出す（汎用の骨組み→画面の骨組み→本番、の2段の切り替えを避ける）。
 * 画面を追加したら resolveShellSkeleton にも加える。
 */
export function ShellRouteSkeleton() {
  const pathname = usePathname();
  const resolved = resolveShellSkeleton(pathname);
  if (resolved === 'chat') {
    return (
      <ContentFrame width="full" fill>
        <RouteLoading variant="chat" />
      </ContentFrame>
    );
  }
  if (!resolved) return <RouteLoading frame="medium" />;
  return (
    <ContentFrame width={resolved.width}>
      {isTrainingSectionPath(pathname) && <TrainingSectionNav />}
      {resolved.skeleton}
    </ContentFrame>
  );
}

/**
 * アプリ全体（(app)/loading.tsx）の読み込み中表示。
 * 没入画面（ドリル・ライブ通話）は全画面の読み込み表示、シェルの画面は本物のシェル（ナビ付き）の中に
 * 各画面の骨組みを出す（ページを直接開いた直後に、ナビの無いスピナーからシェル全体へ切り替わるのを避ける）。
 */
export function AppRouteLoading() {
  const pathname = usePathname();
  if (isImmersivePath(pathname)) return <ImmersiveLoading />;
  return (
    <AppShell>
      <ShellRouteSkeleton />
    </AppShell>
  );
}
