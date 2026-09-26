'use client';

import Link from 'next/link';
import { ArrowRight, Trash2 } from 'lucide-react';
import { LIVE_SESSION_EARLY_JOIN_BEFORE_MS } from '@gabby/lib/liveSessionRoom/constants';
import { toIsoDateInZone } from '@gabby/lib/date/date';
import { getResumePath } from '@gabby/lib/navigation/student-path';
import { cn } from '@/lib/utils';
import type { TodayFocus } from '../_lib/todayFocus';
import { ProgressBar } from './HomeCard';

interface TodayFocusCardProps {
  focus: TodayFocus;
  nowMs: number;
  timezone: string;
  onClearResume: () => void;
}

interface FocusView {
  eyebrow: string;
  title: string;
  description?: string;
  progressPercent?: number;
  note?: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}

const EARLY_JOIN_MINUTES = Math.round(LIVE_SESSION_EARLY_JOIN_BEFORE_MS / 60000);

const formatTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('ja-JP', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** 開始日時を「今日 20:00〜20:30」のように表す（表示対象は24時間以内のため今日/明日のみ） */
const formatSessionTime = (startIso: string, endIso: string, nowMs: number, timeZone: string) => {
  const dayLabel = toIsoDateInZone(startIso, timeZone) === toIsoDateInZone(nowMs, timeZone) ? '今日' : '明日';
  return `${dayLabel} ${formatTime(startIso, timeZone)}〜${formatTime(endIso, timeZone)}`;
};

function toFocusView(focus: TodayFocus, nowMs: number, timeZone: string): FocusView {
  switch (focus.kind) {
    case 'session': {
      const { session, canJoin } = focus;
      return {
        eyebrow: canJoin ? 'ライブセッションの時間です' : 'まもなくライブセッション',
        title: `${session.counterpart_name} コーチとのセッション`,
        description: formatSessionTime(session.start_datetime, session.end_datetime, nowMs, timeZone),
        note: canJoin ? undefined : `開始${EARLY_JOIN_MINUTES}分前から入室できます`,
        primary: canJoin
          ? { label: '入室する', href: `/live-room/${session.session_id}` }
          : { label: '予定を確認する', href: '/live-room' },
      };
    }
    case 'resume': {
      const { resume } = focus;
      return {
        eyebrow: '続きから再開',
        title: resume.com_m_contents.content_name,
        description: resume.metadata.display?.position_text,
        progressPercent: resume.metadata.display?.progress_percent ?? 0,
        primary: { label: '続きから始める', href: getResumePath(resume) },
      };
    }
    case 'assignment': {
      const { assignment } = focus;
      return {
        eyebrow: 'コーチからの課題',
        title: assignment.content_name,
        description: `${assignment.completed_session_count} / ${assignment.total_session_count} セッション完了`,
        progressPercent:
          assignment.total_session_count > 0
            ? (assignment.completed_session_count / assignment.total_session_count) * 100
            : 0,
        primary: { label: '課題に取り組む', href: `/training/dialogue/${assignment.assignment_id}` },
      };
    }
    case 'start':
      return {
        eyebrow: '今日の学習',
        title: '今日も少しだけ、英語に触れましょう',
        description: '教材を選んで学習を始めましょう。お気に入りからの復習もおすすめです。',
        primary: { label: '教材を選ぶ', href: '/library' },
        secondary: { label: 'お気に入りを復習', href: '/favorites' },
      };
  }
}

/**
 * ホームの主役カード「今日やること」。
 * 状況に応じた行動を1つだけ提示し、ブランドのグラデーション面で特別感を出す。
 */
export function TodayFocusCard({ focus, nowMs, timezone, onClearResume }: TodayFocusCardProps) {
  const view = toFocusView(focus, nowMs, timezone);

  return (
    <section className="relative overflow-hidden rounded-card bg-brand-hero p-6 sm:p-8 text-white shadow-md shadow-brand/15">
      <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />

      <div className="relative flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-brand-100">{view.eyebrow}</p>
        {focus.kind === 'resume' && (
          <button
            type="button"
            onClick={onClearResume}
            aria-label="ブックマークを削除"
            className="-m-2 p-2 text-white/70 hover:text-white transition-colors"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <h2 className="relative mt-2 text-xl sm:text-2xl font-bold leading-snug tracking-tight line-clamp-2">{view.title}</h2>
      {view.description && <p className="relative mt-2 text-sm text-white/85">{view.description}</p>}

      {view.progressPercent !== undefined && (
        <div className="relative mt-5 flex items-center gap-3">
          <ProgressBar percent={view.progressPercent} tone="light" />
          <span className="shrink-0 text-xs font-semibold text-brand-100">{Math.round(view.progressPercent)}%</span>
        </div>
      )}

      <div className="relative mt-6 flex flex-wrap items-center gap-3">
        <Link
          href={view.primary.href}
          className="group inline-flex h-12 items-center gap-2 rounded-control bg-white px-6 text-sm font-bold text-brand shadow-sm hover:bg-brand-soft active:scale-[0.98] transition-all"
        >
          {view.primary.label}
          <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
        {view.secondary && (
          <Link
            href={view.secondary.href}
            className="inline-flex h-12 items-center rounded-control border border-white/30 px-5 text-sm font-semibold text-white hover:bg-white/10 active:scale-[0.98] transition-all"
          >
            {view.secondary.label}
          </Link>
        )}
        {view.note && <p className={cn('text-xs text-white/75', !view.secondary && 'sm:ml-1')}>{view.note}</p>}
      </div>
    </section>
  );
}
