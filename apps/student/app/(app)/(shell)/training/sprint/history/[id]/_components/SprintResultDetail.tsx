'use client';

import { formatZonedDate, toIsoMonthInZone } from '@gabby/lib/date/date';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { ShellPageHeader } from '@/components/shell/ShellPage';
import { AudioResumeBanner } from '@/components/common/AudioResumeBanner';
import { useSprintResultPlayback } from '@/components/training/sprint-result/useSprintResultPlayback';
import { SprintResultQuestionList } from '@/components/training/sprint-result/SprintResultQuestionList';
import {
  SprintPlayAllButton,
  SprintResultSummary,
  SprintRetryLink,
} from '@/components/training/sprint-result/SprintResultSummary';
import type { SprintResultData } from '@/components/training/sprint-result/types';

/**
 * スプリントの履歴から開く結果画面（シェル画面）。
 * 振り返りのための画面なので常設ナビを出し、戻る先は該当セッションをハイライトした履歴画面にする。
 */
export function SprintResultDetail({ scoreData, questions, courseTitle }: SprintResultData) {
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
        <div className="grid grid-cols-2 gap-3">
          <SprintPlayAllButton playback={playback} />
          <SprintRetryLink scoreData={scoreData} />
        </div>
      </ShellPageHeader>

      <div className="mb-4 rounded-card border border-line bg-surface p-4 sm:p-5">
        <SprintResultSummary scoreData={scoreData} courseTitle={courseTitle} />
      </div>

      <SprintResultQuestionList scoreData={scoreData} questions={questions} playback={playback} />

      <AudioResumeBanner status={playback.resumeStatus} onResume={() => { playback.unlockAudioContext(); }} />
    </>
  );
}
