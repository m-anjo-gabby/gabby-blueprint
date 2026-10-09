'use client';

import Link from 'next/link';
import { ChevronRight, CircleAlert, Hourglass } from 'lucide-react';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import type { SessionListItem } from '@gabby/types/session';
import type { LiveSessionOverview } from '@gabby/types/matching';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionCoachHeading, SessionCoachHeadingSkeleton } from '@/components/session/SessionCoachHeading';
import { JoinSessionButton } from '@/components/session/JoinSessionButton';
import { SessionBreakdown } from '@/app/(app)/(shell)/live-room/_components/SessionBreakdown';
import { HomeCard } from './HomeCard';
import { cn } from '@/lib/utils';

/**
 * ライブセッションで生徒の対応が必要なこと（ホームではライブセッション管理等への導線だけを出す）。
 * tone が 'waiting' の項目は、生徒の対応ではなく相手の回答待ち（専属コーチの申請の承認待ち等）の案内で、注意の見た目にしない。
 */
export interface LiveSessionAction {
  key: string;
  label: string;
  href: string;
  tone?: 'action' | 'waiting';
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
  const timezone = useTimezone();

  if (!session) {
    return (
      <section className={LIVE_LAYOUT.block}>
        <h3 className={LIVE_LAYOUT.blockTitle}>次回のセッション</h3>
        <p className="mt-2 text-sm text-ink-muted">予定されているセッションはありません。</p>
      </section>
    );
  }

  return (
    <section className={LIVE_LAYOUT.block}>
      <h3 className={LIVE_LAYOUT.blockTitle}>次回のセッション</h3>
      <SessionCoachHeading session={session} timezone={timezone} size="md" className="mt-3" />
      <JoinSessionButton sessionId={session.session_id} startDatetime={session.start_datetime} className="mt-4" />
    </section>
  );
}

/**
 * ホームのライブセッション（ライブセッション付きの契約がある生徒だけ）。
 * 対応が必要なこと（コーチ未選択・未予約・振替候補）を先頭に出し、次回のセッションと契約の回数の内訳を並べる。
 * 「今日やること」は自主トレーニングに限るため、入室もこのカードから行う（入室ボタンは常に押せる状態で、押した時に判定する）。詳細・操作はライブセッション管理に任せる。
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
                className={cn(
                  'group flex items-center gap-3 rounded-control border px-3 py-2.5 text-sm font-semibold transition-colors',
                  action.tone === 'waiting'
                    ? 'border-line bg-canvas text-ink-soft hover:border-ink-subtle/40'
                    : 'border-brand-100 bg-brand-soft text-brand-strong hover:border-brand-200'
                )}
              >
                {action.tone === 'waiting' ? <Hourglass size={16} className="shrink-0" /> : <CircleAlert size={16} className="shrink-0" />}
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
            <SessionCoachHeadingSkeleton size="md" className="mt-3" />
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
