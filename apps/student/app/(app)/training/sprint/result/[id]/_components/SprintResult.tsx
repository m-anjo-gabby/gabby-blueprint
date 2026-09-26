// apps\student\app\(app)\training\sprint\result\[id]\_components\SprintResult.tsx
'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, FastForward, Home, Trophy } from 'lucide-react';
import { formatZonedDate } from '@gabby/lib/date/date';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { AudioResumeBanner } from '@/components/common/AudioResumeBanner';
import { useSprintResultPlayback } from '@/components/training/sprint-result/useSprintResultPlayback';
import { SprintResultQuestionList } from '@/components/training/sprint-result/SprintResultQuestionList';
import {
  SprintPlayAllButton,
  SprintResultSummary,
  SprintRetryLink,
  getSprintSelectHref,
} from '@/components/training/sprint-result/SprintResultSummary';
import type { SprintResultData } from '@/components/training/sprint-result/types';

const NAV_BUTTON_CLASS =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-ink-subtle transition-all hover:bg-surface hover:text-brand active:scale-95';

/**
 * スプリント実施直後の結果画面（没入画面）。
 * 続けてリトライする流れのため、戻る先はスプリント選択画面にする。
 * 履歴から振り返る場合はシェル側の結果画面（/training/sprint/history/[id]）を使う。
 */
export function SprintResult({ scoreData, questions, courseTitle }: SprintResultData) {
  const timezone = useTimezone();
  // フッターの主役ボタン。まず「全て再生」から始まり、再生完了/停止で「リトライ」に切り替わる
  const [footerShowsRetry, setFooterShowsRetry] = useState(false);
  const showRetry = useCallback(() => setFooterShowsRetry(true), []);
  const playback = useSprintResultPlayback(scoreData, questions, { onPlayAllSettled: showRetry });
  const selectHref = getSprintSelectHref(scoreData);

  return (
    <div className="relative flex h-full w-full max-w-2xl select-none flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-xl animate-fade-in selection:bg-brand-100">
      {/* ヘッダー：ナビゲーションと結果サマリー */}
      <div className="relative shrink-0 space-y-4 overflow-hidden border-b border-brand-100/40 bg-brand-50/60 p-5 sm:p-6">
        <div className="pointer-events-none absolute right-0 top-0 p-3 opacity-[0.08]">
          <Trophy size={115} strokeWidth={1.2} className="text-brand" />
        </div>

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href={selectHref} className={NAV_BUTTON_CLASS} title="スプリント選択に戻る" aria-label="スプリント選択に戻る">
              <ChevronLeft size={20} strokeWidth={2.5} />
            </Link>
            <Link
              href="/dashboard"
              className={`${NAV_BUTTON_CLASS} border border-line bg-surface`}
              title="ホームに戻る"
              aria-label="ホームに戻る"
            >
              <Home size={18} strokeWidth={2.5} />
            </Link>
          </div>

          <div className="text-right">
            <p className="text-xs font-bold text-brand">スプリント結果</p>
            <p className="text-[11px] text-ink-muted tabular-nums">{formatZonedDate(scoreData.created_at, timezone)}</p>
          </div>
        </div>

        <SprintResultSummary scoreData={scoreData} courseTitle={courseTitle} className="relative z-10" />
      </div>

      {/* 出題リスト */}
      <div className="flex-1 overflow-y-auto bg-canvas p-5 sm:p-6">
        <SprintResultQuestionList scoreData={scoreData} questions={questions} playback={playback} />
      </div>

      {/* フッター：状況に応じて役割が切り替わる単一ボタン */}
      <div className="shrink-0 border-t border-line bg-surface p-5 sm:p-6">
        {footerShowsRetry ? (
          <SprintRetryLink scoreData={scoreData} />
        ) : (
          // まず全て再生から。発話評価の「スキップする」と同じ視覚パターンで、再生せずすぐリトライする逃げ道を用意する
          <div className="flex flex-col items-center gap-2">
            <SprintPlayAllButton playback={playback} primary />
            <Link
              href={selectHref}
              className="flex items-center justify-center gap-1.5 rounded-control px-6 py-1.5 text-ink-subtle transition-all hover:text-brand active:scale-[0.98]"
              title="再生せずにすぐリトライする"
            >
              <FastForward size={12} strokeWidth={2.5} />
              <span className="text-xs font-bold">スプリントをリトライ</span>
            </Link>
          </div>
        )}
      </div>

      <AudioResumeBanner status={playback.resumeStatus} onResume={() => { playback.unlockAudioContext(); }} />
    </div>
  );
}
