// apps\student\app\(app)\training\sprint\result\[id]\_components\SprintResult.tsx
'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, FastForward, Home } from 'lucide-react';
import { formatZonedDate } from '@gabby/lib/date/date';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { AudioResumeBanner } from '@/components/common/AudioResumeBanner';
import { ImmersivePanel } from '@/components/shell/PageFrames';
import { useSprintResultPlayback } from '@/components/training/sprint-result/useSprintResultPlayback';
import { SprintResultQuestionList } from '@/components/training/sprint-result/SprintResultQuestionList';
import {
  SprintPlayAllButton,
  SprintResultSummary,
  SprintRetryLink,
  getSprintSelectHref,
} from '@/components/training/sprint-result/SprintResultSummary';
import type { SprintResultData } from '@/components/training/sprint-result/types';

// 見出しの並び（戻る・見出し・日付）は履歴側の ShellPageHeader と揃える
const NAV_BUTTON_CLASS =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink-muted transition-all hover:bg-canvas hover:text-ink active:scale-95';

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
    <ImmersivePanel className="select-none">
      {/* ヘッダー：戻る・見出し・日付（履歴側の結果画面と同じ並び）。ホームへはナビが無いため右端に置く */}
      <header className="shrink-0 space-y-1.5 border-b border-line px-5 pb-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex items-center gap-2">
          <Link href={selectHref} className={`-ml-2 ${NAV_BUTTON_CLASS}`} aria-label="スプリント選択に戻る" title="スプリント選択に戻る">
            <ChevronLeft size={22} />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight text-ink sm:text-3xl">スプリント結果</h1>
          <Link href="/dashboard" className={NAV_BUTTON_CLASS} aria-label="ホームに戻る" title="ホームに戻る">
            <Home size={20} />
          </Link>
        </div>
        <p className="text-sm leading-relaxed text-ink-muted tabular-nums">{formatZonedDate(scoreData.created_at, timezone)}</p>
      </header>

      {/* 結果サマリーと出題リスト（履歴側と同じくサマリーも一緒にスクロールさせ、リストを広く見せる） */}
      <div className="flex-1 overflow-y-auto bg-canvas p-5 sm:p-6">
        <SprintResultSummary scoreData={scoreData} courseTitle={courseTitle} className="mb-4" />
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
    </ImmersivePanel>
  );
}
