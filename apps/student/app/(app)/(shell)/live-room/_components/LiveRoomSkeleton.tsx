'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, CalendarDays, MessageCircle } from 'lucide-react';
import { getTrainingMetricConfig } from '@gabby/lib/content/ui';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ShellPageHeader, ShellSectionTitle } from '@/components/shell/ShellPage';
import { RouteSkeleton } from '@/components/shell/RouteLoading';
import { SessionCoachHeadingSkeleton } from '@/components/session/SessionCoachHeading';
import { useShellNavContext } from '@/components/shell/ShellNavContext';
import { LiveSessionIntro } from './LiveSessionIntro';
import { SectionHeading, SessionResultPageHeader } from '../sessions/[sessionId]/result/_components/SessionResultParts';

const SPRINT = getTrainingMetricConfig('sprint');
const HISTORY_ROW_COUNT = 3;

/** ライブセッションの画面の見出し（カレンダーへの導線付き。LiveSessionHub と骨組みで共有する） */
export function LiveRoomPageHeader() {
  return (
    <ShellPageHeader
      title="ライブセッション"
      aside={
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href="/calendar">
            <CalendarDays size={15} className="text-brand" />
            カレンダー
          </Link>
        </Button>
      }
    />
  );
}

const CARD_CLASS = 'rounded-card border border-line bg-surface p-5 sm:p-6 shadow-xs';

/**
 * ライブセッションのハブの骨組み。区画の有無はデータ次第のため、最も多い
 * 「次回のセッションあり（現在の契約）」の並び（次回のセッション・契約の状況・履歴）で描く。
 */
function LiveSessionHubSkeleton() {
  return (
    <>
      <LiveRoomPageHeader />
      <div className="space-y-8">
        <div>
          <ShellSectionTitle>次回のセッション</ShellSectionTitle>
          <div aria-hidden className={CARD_CLASS}>
            <SessionCoachHeadingSkeleton size="lg" />
            <Skeleton className="mt-5 h-10 w-full rounded-control sm:w-40" />
            <div className="mt-2 flex h-4 items-center">
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        </div>

        <div>
          <ShellSectionTitle>契約の状況</ShellSectionTitle>
          <div aria-hidden className={CARD_CLASS}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line pb-4">
              <div className="flex h-6 items-center">
                <Skeleton className="h-4.5 w-36" />
              </div>
              <div className="flex h-4 items-center">
                <Skeleton className="h-3 w-44" />
              </div>
            </div>
            <div className="mt-4 flex h-8 items-center">
              <Skeleton className="h-5 w-40" />
            </div>
            <Skeleton className="mt-4 h-2.5 w-full rounded-full" />
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="my-0.5 h-3 w-20" />
              ))}
            </div>
          </div>
        </div>

        <div>
          <ShellSectionTitle>履歴</ShellSectionTitle>
          <ul aria-hidden className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-xs">
            {Array.from({ length: HISTORY_ROW_COUNT }, (_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="size-4 shrink-0 rounded-sm" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

/** セッション結果の区画（見出しは本物、本文は骨組み） */
function ResultSectionSkeleton({ heading, lines }: { heading: React.ReactNode; lines: string[] }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 space-y-4">
      {heading}
      <div aria-hidden className="space-y-2">
        {lines.map((width, i) => (
          <Skeleton key={i} className={`h-3.5 ${width}`} />
        ))}
      </div>
    </section>
  );
}

/** セッション結果の骨組み（見出し・区画見出しは本物、日時・コーチ・各区画の本文を骨組み） */
function SessionResultSkeleton() {
  return (
    <>
      <SessionResultPageHeader />
      <div className="space-y-4">
        <section aria-hidden className="rounded-card border border-line bg-surface p-4 space-y-3">
          <div className="space-y-3">
            <div className="flex h-6 items-center sm:h-7">
              <Skeleton className="h-4.5 w-64 max-w-full" />
            </div>
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-10 rounded-control" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="flex h-8 items-center border-t border-line pt-2">
            <Skeleton className="h-3 w-20" />
          </div>
        </section>
        <ResultSectionSkeleton
          heading={<SectionHeading icon={BookOpen} iconClassName="bg-brand-soft text-brand" title="宿題" />}
          lines={['w-full', 'w-5/6', 'w-2/3']}
        />
        <ResultSectionSkeleton
          heading={<SectionHeading icon={SPRINT.icon} iconClassName={SPRINT.theme.iconTile} title="トレーニング" />}
          lines={['w-3/4', 'w-1/2']}
        />
        <ResultSectionSkeleton
          heading={<SectionHeading icon={MessageCircle} iconClassName="bg-brand-soft text-brand" title="チャット履歴" />}
          lines={['w-2/3', 'w-1/2']}
        />
      </div>
    </>
  );
}

/**
 * ライブセッション配下の読み込み中表示（loading.tsx 用）。
 * ハブとセッション結果（/live-room/sessions/[id]/result）の両方でこのフォルダの loading.tsx が出るため、
 * 表示中のパスで出し分ける。ライブセッション付き契約が無い生徒のハブは、アップセル導線をそのまま出す。
 */
export function LiveRoomRouteSkeleton() {
  const pathname = usePathname();
  const { hasLiveSessionContract } = useShellNavContext();
  const isResult = pathname.startsWith('/live-room/sessions/');
  // ライブセッション付き契約が無い生徒は、ハブではなくアップセル導線を表示する（本番の page.tsx と同じ判定）。
  // 導線はデータに依存しないため、骨組みではなく本物をそのまま出す
  if (!isResult && !hasLiveSessionContract) return <LiveSessionIntro />;
  return <RouteSkeleton>{isResult ? <SessionResultSkeleton /> : <LiveSessionHubSkeleton />}</RouteSkeleton>;
}
