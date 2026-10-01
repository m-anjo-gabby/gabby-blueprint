'use client';

import Link from 'next/link';
import { ArrowRight, ChevronRight, CircleAlert, Video } from 'lucide-react';
import { useNow } from '@gabby/lib/hooks/useNow';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { LIVE_SESSION_EARLY_JOIN_BEFORE_MS } from '@gabby/lib/liveSessionRoom/constants';
import type { SessionListItem } from '@gabby/types/session';
import type { LiveSessionOverview } from '@gabby/types/matching';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CoachAvatar } from '@/components/session/CoachAvatar';
import { formatSessionSlot, formatTimeUntil } from '@/lib/sessionFormat';
import { SessionBreakdown } from '@/app/(app)/(shell)/live-room/_components/SessionBreakdown';
import { HomeCard } from './HomeCard';

/** ライブセッションで生徒の対応が必要なこと（ホームではライブセッション管理等への導線だけを出す） */
export interface LiveSessionAction {
  key: string;
  label: string;
  href: string;
}

interface LiveSessionCardProps {
  nextSession: SessionListItem | null;
  /** 契約の回数の内訳（取得に失敗した場合は null） */
  overview: LiveSessionOverview | null;
  /** 現在の契約か（開始前の契約は false） */
  isCurrent: boolean;
  /** 予約リクエスト・振替候補の回答待ちの件数（未予約のうち調整中として表示する） */
  adjustingCount: number;
  actions: LiveSessionAction[];
}

const CARD_TITLE = 'ライブセッション';
const CARD_ACTION = { label: '詳しく見る', href: '/live-room' };

/** カードの中の並び（本番と骨組みで共有する）。幅が広いときは「次回」と「契約の状況」を横に並べる */
const LIVE_LAYOUT = {
  grid: 'grid gap-3 @2xl:grid-cols-2',
  block: 'rounded-control bg-canvas p-4',
  blockTitle: 'text-xs text-ink-muted',
} as const;

function NextSessionBlock({ session }: { session: SessionListItem | null }) {
  const nowMs = useNow();
  const timezone = useTimezone();

  if (!session) {
    return (
      <section className={LIVE_LAYOUT.block}>
        <h3 className={LIVE_LAYOUT.blockTitle}>次回のセッション</h3>
        <p className="mt-2 text-sm text-ink-muted">予定されているセッションはありません。</p>
      </section>
    );
  }

  const slot = formatSessionSlot(session.start_datetime, session.end_datetime, timezone);
  const canJoin = nowMs !== null && nowMs >= new Date(session.start_datetime).getTime() - LIVE_SESSION_EARLY_JOIN_BEFORE_MS;
  const untilStart = nowMs !== null ? formatTimeUntil(session.start_datetime, nowMs) : null;

  return (
    <section className={LIVE_LAYOUT.block}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={LIVE_LAYOUT.blockTitle}>次回のセッション</h3>
        {untilStart && !canJoin && (
          <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-semibold text-brand-strong">
            開始まで{untilStart}
          </span>
        )}
      </div>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 font-bold text-ink tabular-nums">
        <span className="text-lg">{slot.date}</span>
        <span className="text-base">{slot.time}</span>
      </p>
      <div className="mt-2 flex items-center gap-2">
        <CoachAvatar iconPath={session.counterpart_icon_path} size={28} />
        <p className="truncate text-sm text-ink-muted">{session.counterpart_name} コーチ</p>
      </div>
      {canJoin && (
        <Button asChild className="mt-4 w-full sm:w-auto">
          <Link href={`/live-room/${session.session_id}`}>
            <Video size={16} />
            入室する
            <ArrowRight size={14} />
          </Link>
        </Button>
      )}
    </section>
  );
}

/**
 * ホームのライブセッション（ライブセッション付きの契約がある生徒だけ）。
 * 対応が必要なこと（コーチ未選択・未予約・振替候補）を先頭に出し、次回のセッションと契約の回数の内訳を並べる。
 * 「今日やること」は自主トレーニングに限るため、入室もこのカードから行う。詳細・操作はライブセッション管理に任せる。
 */
export function LiveSessionCard({ nextSession, overview, isCurrent, adjustingCount, actions }: LiveSessionCardProps) {
  return (
    <HomeCard title={CARD_TITLE} action={CARD_ACTION}>
      {actions.length > 0 && (
        <ul className="mb-3 space-y-2">
          {actions.map((action) => (
            <li key={action.key}>
              <Link
                href={action.href}
                className="group flex items-center gap-3 rounded-control border border-brand-100 bg-brand-soft px-3 py-2.5 text-sm font-semibold text-brand-strong transition-colors hover:border-brand-200"
              >
                <CircleAlert size={16} className="shrink-0" />
                <span className="flex-1">{action.label}</span>
                <ChevronRight size={16} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="@container">
        <div className={LIVE_LAYOUT.grid}>
          <NextSessionBlock session={nextSession} />
          <section className={LIVE_LAYOUT.block}>
            <h3 className={LIVE_LAYOUT.blockTitle}>{isCurrent ? '契約の状況' : '契約の内容'}</h3>
            {overview ? (
              <>
                <p className="mt-2 flex items-baseline gap-1.5 font-bold text-ink tabular-nums">
                  <span className="text-sm font-normal text-ink-muted">実施済み</span>
                  <span className="text-lg">{overview.completed_count}</span>
                  <span className="text-sm font-normal text-ink-muted">/ {overview.total_sessions}回</span>
                </p>
                <SessionBreakdown overview={overview} isCurrent={isCurrent} adjustingCount={adjustingCount} className="mt-3" />
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">契約の状況を取得できませんでした。</p>
            )}
          </section>
        </div>
      </div>
    </HomeCard>
  );
}

/** ライブセッションのカードの骨組み（取得を待つ間。見出しと区画の枠は本物で描く） */
export function LiveSessionCardSkeleton() {
  return (
    <HomeCard title={CARD_TITLE} action={CARD_ACTION}>
      <div className="@container">
        <div className={LIVE_LAYOUT.grid}>
          <section className={LIVE_LAYOUT.block}>
            <h3 className={LIVE_LAYOUT.blockTitle}>次回のセッション</h3>
            <Skeleton className="mt-2.5 h-5 w-48" />
            <div className="mt-2.5 flex items-center gap-2">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="h-3.5 w-28" />
            </div>
          </section>
          <section className={LIVE_LAYOUT.block}>
            <h3 className={LIVE_LAYOUT.blockTitle}>契約の状況</h3>
            <Skeleton className="mt-2.5 h-5 w-36" />
            <Skeleton className="mt-3.5 h-2.5 w-full rounded-full" />
            <Skeleton className="mt-3 h-3.5 w-3/4" />
          </section>
        </div>
      </div>
    </HomeCard>
  );
}
