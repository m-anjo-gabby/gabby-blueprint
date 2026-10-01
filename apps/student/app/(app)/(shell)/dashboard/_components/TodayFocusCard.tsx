'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getContentTypeConfig } from '@gabby/lib/content/ui';
import { getResumePath } from '@gabby/lib/navigation/student-path';
import type { TodayFocus } from '../_lib/todayFocus';
import { HeroBackdrop, ProgressBar } from './HomeCard';

interface TodayFocusCardProps {
  focus: TodayFocus;
  /** 再開情報（ブックマーク）の削除。主役が「続きから」の時だけ使う */
  onClearResume?: () => void;
}

interface FocusView {
  eyebrow: string;
  title: string;
  description?: string;
  progressPercent?: number;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}

function toFocusView(focus: TodayFocus): FocusView {
  switch (focus.kind) {
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
    case 'resume': {
      const { resume } = focus;
      return {
        eyebrow: '続きから',
        title: resume.com_m_contents.content_name,
        description: `${getContentTypeConfig(resume.com_m_contents.content_type).label}・前回の続きから再開できます`,
        progressPercent: resume.metadata.display?.progress_percent ?? 0,
        primary: { label: '続きから再開', href: getResumePath(resume) },
        secondary: { label: '別の教材を選ぶ', href: '/library' },
      };
    }
    case 'start':
      return {
        eyebrow: '今日のトレーニング',
        title: '今日も少しだけ、英語に触れましょう',
        description: '教材を選んでトレーニングを始めましょう。お気に入りからの復習もおすすめです。',
        primary: { label: '教材を選ぶ', href: '/library' },
        secondary: { label: 'お気に入りを復習', href: '/favorites' },
      };
  }
}

/**
 * ホームの主役カード「今日やること」。
 * 自主トレーニングで次に取り組むことを1つだけ提示し、ブランドのグラデーション面で特別感を出す。
 */
export function TodayFocusCard({ focus, onClearResume }: TodayFocusCardProps) {
  const view = toFocusView(focus);

  return (
    <section className="relative flex h-full flex-col overflow-hidden rounded-card bg-brand-hero p-6 sm:p-8 text-white shadow-md shadow-brand/15">
      <HeroBackdrop />

      <p className="relative text-xs font-semibold tracking-wide text-brand-100">{view.eyebrow}</p>

      <h2 className="relative mt-2 text-xl sm:text-2xl font-bold leading-snug tracking-tight line-clamp-2">{view.title}</h2>
      {view.description && <p className="relative mt-2 text-sm text-white/85">{view.description}</p>}

      {view.progressPercent !== undefined && (
        <div className="relative mt-5 flex items-center gap-3">
          <ProgressBar percent={view.progressPercent} tone="light" />
          <span className="shrink-0 text-xs font-semibold text-brand-100">{Math.round(view.progressPercent)}%</span>
        </div>
      )}

      {/* 隣のカードより背が低い場合も、ボタンはカードの下端に揃える */}
      <div className="relative mt-auto flex flex-wrap items-center gap-3 pt-6">
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
        {focus.kind === 'resume' && onClearResume && (
          <button
            type="button"
            onClick={onClearResume}
            className="text-xs text-white/75 underline-offset-4 hover:text-white hover:underline transition-colors sm:ml-auto"
          >
            ブックマークを削除
          </button>
        )}
      </div>
    </section>
  );
}
