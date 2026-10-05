'use client';

import { formatZonedDate, toIsoMonthInZone } from '@gabby/lib/date/date';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { ShellPageHeader } from '@/components/shell/ShellPage';
import { AudioResumeBanner } from '@/components/common/AudioResumeBanner';
import { useSprintResultPlayback } from '@/components/training/sprint-result/useSprintResultPlayback';
import { SprintResultQuestionList } from '@/components/training/sprint-result/SprintResultQuestionList';
import { SprintResultActions, SprintResultSummary } from '@/components/training/sprint-result/SprintResultSummary';
import type { SprintResultData } from '@/components/training/sprint-result/types';

/**
 * スプリントの履歴から開く結果画面（シェル画面）。
 * 振り返りのための画面なので常設ナビを出し、戻る先は該当セッションをハイライトした履歴画面にする。
 */
export function SprintResultDetail({ scoreData, questions, courseTitle, favoriteQuestionIds }: SprintResultData) {
  const timezone = useTimezone();
  const playback = useSprintResultPlayback(scoreData, questions);

  const historyParams = new URLSearchParams({
    month: toIsoMonthInZone(scoreData.created_at, timezone),
    focus: scoreData.self_sprint_id,
  });

  return (
    <>
      <ShellPageHeader
        title="スプリント結果"
        description={formatZonedDate(scoreData.created_at, timezone)}
        back={`/training/sprint/history?${historyParams.toString()}`}
      >
        <SprintResultActions scoreData={scoreData} playback={playback} />
      </ShellPageHeader>

      <SprintResultSummary scoreData={scoreData} courseTitle={courseTitle} className="mb-4" />

      <SprintResultQuestionList
        scoreData={scoreData}
        questions={questions}
        playback={playback}
        initialFavoriteIds={favoriteQuestionIds}
      />

      <AudioResumeBanner status={playback.resumeStatus} onResume={() => { playback.unlockAudioContext(); }} />
    </>
  );
}
