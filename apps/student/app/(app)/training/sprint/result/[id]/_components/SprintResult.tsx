// apps\student\app\(app)\training\sprint\result\[id]\_components\SprintResult.tsx
'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SPRINT_FLOW_TIMING } from '@gabby/types/sprint';
import { ChevronLeft, Home } from 'lucide-react';
import { formatZonedDate } from '@gabby/lib/date/date';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { AudioResumeBanner } from '@/components/common/AudioResumeBanner';
import { ImmersiveBody, ImmersivePanel } from '@/components/shell/PageFrames';
import { useSprintResultPlayback } from '@/components/training/sprint-result/useSprintResultPlayback';
import { SprintResultQuestionList } from '@/components/training/sprint-result/SprintResultQuestionList';
import {
  SprintResultActions,
  SprintResultSummary,
  getSprintSelectHref,
} from '@/components/training/sprint-result/SprintResultSummary';
import type { SprintResultData } from '@/components/training/sprint-result/types';
import { SPRINT_RESULT_AUTOPLAY_PARAM } from '@/components/training/sprint-result/links';

// 見出しの並び（戻る・見出し・日付）は履歴側の ShellPageHeader と揃える
const NAV_BUTTON_CLASS =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink-muted transition-all hover:bg-canvas hover:text-ink active:scale-95';

/**
 * スプリント実施直後の結果画面（没入画面）。
 * 続けてリトライする流れのため、戻る先はスプリント選択画面にする。
 * 選択→実施→結果の間は履歴を置き換えて移動し、履歴には入口（教材一覧・ホーム等）だけを残す
 * （選択画面の「戻る」で結果画面に戻ってループしないようにする）。
 * 履歴から振り返る場合はシェル側の結果画面（/training/sprint/history/[id]）を使う。
 * 実施の終了から移動してきた場合（`?autoplay=1`）は、「全て再生」を自動で始める。
 * 操作ボタンは履歴側と同じ部品（SprintResultActions）を、ナビの無い没入画面なので親指で押しやすい下部に置く。
 */
export function SprintResult({ scoreData, questions, courseTitle, favoriteQuestionIds }: SprintResultData) {
  const timezone = useTimezone();
  const playback = useSprintResultPlayback(scoreData, questions);
  const selectHref = getSprintSelectHref(scoreData);

  // 実施の終了から移動してきた場合は「全て再生」を自動で始める（同じページ内の移動のため音声はアンロック済み）。
  // 始めたら指定をURLから外し、再読み込み・戻るで再び自動再生しないようにする
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shouldAutoPlay = searchParams.get(SPRINT_RESULT_AUTOPLAY_PARAM) === '1';
  const togglePlayAllRef = useRef(playback.togglePlayAll);
  useEffect(() => {
    togglePlayAllRef.current = playback.togglePlayAll;
  }, [playback.togglePlayAll]);
  useEffect(() => {
    if (!shouldAutoPlay) return;
    const timer = setTimeout(() => {
      router.replace(pathname, { scroll: false });
      void togglePlayAllRef.current();
    }, SPRINT_FLOW_TIMING.sprint.resultAutoPlayDelayMs);
    return () => clearTimeout(timer);
  }, [shouldAutoPlay, pathname, router]);

  return (
    <ImmersivePanel className="select-none">
      {/* ヘッダー：戻る・見出し・日付（履歴側の結果画面と同じ並び）。ホームへはナビが無いため右端に置く */}
      <header className="shrink-0 space-y-1.5 border-b border-line px-5 pb-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex items-center gap-2">
          <Link href={selectHref} replace className={`-ml-2 ${NAV_BUTTON_CLASS}`} aria-label="スプリント選択に戻る" title="スプリント選択に戻る">
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
      <ImmersiveBody className="bg-canvas p-5 sm:p-6">
        <SprintResultSummary scoreData={scoreData} courseTitle={courseTitle} className="mb-4" />
        <SprintResultQuestionList
          scoreData={scoreData}
          questions={questions}
          playback={playback}
          initialFavoriteIds={favoriteQuestionIds}
        />
      </ImmersiveBody>

      {/* フッター：履歴側と同じ操作ボタン（全て再生／停止・リトライ） */}
      <div className="shrink-0 border-t border-line bg-surface p-5 sm:p-6">
        <SprintResultActions scoreData={scoreData} playback={playback} />
      </div>

      <AudioResumeBanner status={playback.resumeStatus} onResume={() => { playback.unlockAudioContext(); }} />
    </ImmersivePanel>
  );
}
