'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@gabby/lib/hooks/useToast';
import { DetailSection } from '../../_components/DetailSection';
import { TriangleAlert } from 'lucide-react';
import {
  updateStudentSprintLevel,
  setStudentSprintStage,
  setStudentSprintLevelManaged,
} from '@/actions/adminStudentProgressAction';
import { QUESTION_TYPES, type SprintQuestionType } from '@gabby/types/sprint';
import { MAX_STAGE, type StageLevels } from '@gabby/types/stageProgression';
import { getStageGaps, getStageGoals } from '@gabby/lib/sprint/stageProgression';
import { formatAcquiredSprintLevelLabel } from '@gabby/lib/sprint/utils';
import type { StudentSprintProgress } from '@gabby/types/coachStudent';

interface Props {
  userId: string;
  initialProgress: StudentSprintProgress;
}

const TYPE_ORDER = Object.values(QUESTION_TYPES).sort((a, b) => a.seq_no - b.seq_no);

function toStageLevels(progress: StudentSprintProgress): StageLevels {
  return {
    '0': progress.level_speed,
    '4': progress.level_structure,
    '5': progress.level_builders,
    '6': progress.level_mastery,
  };
}

/**
 * 生徒のスプリントのステージ・レベル管理（コーチの誤操作補正も含め、上げ下げ両方に対応）。
 * 問題種別ごとのレベルと、ステージの強制変更・レベル管理のオン/オフを行う。
 */
export function SprintProgressPanel({ userId, initialProgress }: Props) {
  const t = useTranslations('users.sprint');
  const tCommon = useTranslations('common');
  const [progress, setProgress] = useState<StudentSprintProgress>(initialProgress);
  const [levelSelections, setLevelSelections] = useState<Partial<Record<SprintQuestionType, number>>>({});
  const [savingType, setSavingType] = useState<SprintQuestionType | null>(null);
  const [targetStage, setTargetStage] = useState<number | null>(initialProgress.stage);
  const [isSavingStage, setIsSavingStage] = useState(false);
  const [isSavingManaged, setIsSavingManaged] = useState(false);
  const { showToast } = useToast();
  // 習得済みのレベル。Lv.1から始まる種別の0は「未到達」（トレーニングレポートと同じ表記）
  const formatLevel = (questionType: SprintQuestionType, level: number) =>
    formatAcquiredSprintLevelLabel(questionType, level, t('notReached'));

  const levels = toStageLevels(progress);

  const stageOptions = useMemo(() => Array.from({ length: MAX_STAGE + 1 }, (_, i) => i), []);

  const stageDiff = useMemo(() => {
    if (targetStage === null || targetStage === progress.stage) return null;
    if (targetStage > progress.stage) {
      return { direction: 'up' as const, gaps: getStageGaps(targetStage, levels) };
    }
    const resetGoals = getStageGoals(targetStage);
    const resets = TYPE_ORDER.map((t) => ({
      questionType: t.value,
      current: levels[t.value],
      next: resetGoals[t.value],
    })).filter((r) => r.next !== r.current);
    return { direction: 'down' as const, resets };
  }, [levels, targetStage, progress]);

  const handleLevelSave = async (questionType: SprintQuestionType) => {
    const meta = QUESTION_TYPES[questionType];
    const newLevel = levelSelections[questionType] ?? levels[questionType];
    if (newLevel === levels[questionType]) return;

    setSavingType(questionType);
    try {
      const result = await updateStudentSprintLevel(userId, questionType, newLevel);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      setProgress(result.progress);
      setLevelSelections((prev) => {
        const next = { ...prev };
        delete next[questionType];
        return next;
      });
      showToast(t('toastLevelChanged', { label: meta.label, level: formatLevel(questionType, newLevel) }), 'success');
    } finally {
      setSavingType(null);
    }
  };

  const handleStageSave = async () => {
    if (targetStage === null || targetStage === progress.stage) return;
    setIsSavingStage(true);
    try {
      const result = await setStudentSprintStage(userId, targetStage);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      setProgress(result.progress);
      setTargetStage(result.progress.stage);
      showToast(t('toastStageChanged', { stage: result.progress.stage }), 'success');
    } finally {
      setIsSavingStage(false);
    }
  };

  const handleLevelManagedChange = async (levelManaged: boolean) => {
    setIsSavingManaged(true);
    try {
      const result = await setStudentSprintLevelManaged(userId, levelManaged);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      setProgress(result.progress);
      showToast(t(levelManaged ? 'toastLevelManagedOn' : 'toastLevelManagedOff'), 'success');
    } finally {
      setIsSavingManaged(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label htmlFor="sprint-level-managed" className="text-sm font-bold text-slate-800">
            {t('levelManagedLabel')}
          </label>
          <p className="mt-1 text-xs text-slate-500">
            {t(progress.level_managed ? 'levelManagedOn' : 'levelManagedOff')}
          </p>
        </div>
        <Switch
          id="sprint-level-managed"
          checked={progress.level_managed}
          onCheckedChange={handleLevelManagedChange}
          disabled={isSavingManaged}
          className="mt-0.5"
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <DetailSection title={t('tabLevels')}>
          <div className="space-y-1">
            {TYPE_ORDER.map((type) => {
              const currentLevel = levels[type.value];
              const range = Array.from({ length: type.maxLevel - type.minLevel + 1 }, (_, i) => type.minLevel + i);
              // 未到達（最小レベル未満）の生徒は、現在の値を選択肢の先頭に出す（未到達へ戻す変更はサーバーで受け付けないため、現在の値の時だけ）
              const options = currentLevel < type.minLevel ? [currentLevel, ...range] : range;
              const selected = levelSelections[type.value] ?? currentLevel;

              return (
                <div
                  key={type.value}
                  className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{type.label}</p>
                    <p className="text-xs text-slate-400">
                      {t('currentPrefix', { level: formatLevel(type.value, currentLevel) })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={String(selected)}
                      onValueChange={(v) => setLevelSelections((prev) => ({ ...prev, [type.value]: Number(v) }))}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((lv) => (
                          <SelectItem key={lv} value={String(lv)}>
                            {formatLevel(type.value, lv)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleLevelSave(type.value)}
                      disabled={savingType !== null || selected === currentLevel}
                      pending={savingType === type.value}
                    >
                      {tCommon('save')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </DetailSection>

        <DetailSection title={t('tabStage')}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">{t('currentStage', { stage: progress.stage })}</p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600">{t('targetStageLabel')}</label>
              <Select
                value={targetStage !== null ? String(targetStage) : undefined}
                onValueChange={(v) => setTargetStage(Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stageOptions.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      Stage {s}
                      {s === progress.stage ? t('currentSuffix') : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {stageDiff?.direction === 'up' &&
              (stageDiff.gaps.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                    <TriangleAlert size={13} />
                    <span>{t('gapsWarningTitle')}</span>
                  </div>
                  <p className="text-xs text-amber-700">{t('gapsWarningBody', { stage: targetStage ?? 0 })}</p>
                  <ul className="text-xs text-amber-800 space-y-0.5">
                    {stageDiff.gaps.map((gap) => (
                      <li key={gap.questionType} className="font-semibold">
                        {QUESTION_TYPES[gap.questionType].label}: {formatLevel(gap.questionType, gap.current)} →{' '}
                        {formatLevel(gap.questionType, gap.required)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs font-semibold text-emerald-600">
                  {t('gapsSatisfied', { stage: targetStage ?? 0 })}
                </p>
              ))}

            {stageDiff?.direction === 'down' && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700">
                  <TriangleAlert size={13} />
                  <span>{t('downWarningTitle')}</span>
                </div>
                <p className="text-xs text-rose-700">{t('downWarningBody', { stage: targetStage ?? 0 })}</p>
                {stageDiff.resets.length > 0 ? (
                  <ul className="text-xs text-rose-800 space-y-0.5">
                    {stageDiff.resets.map((reset) => (
                      <li key={reset.questionType} className="font-semibold">
                        {QUESTION_TYPES[reset.questionType].label}: {formatLevel(reset.questionType, reset.current)} →{' '}
                        {formatLevel(reset.questionType, reset.next)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-rose-700">{t('noChanges')}</p>
                )}
              </div>
            )}

            <Button
              type="button"
              onClick={handleStageSave}
              disabled={!stageDiff}
              pending={isSavingStage}
              className="w-full"
            >
              {stageDiff?.direction === 'up' && t('forceUp')}
              {stageDiff?.direction === 'down' && t('forceDown')}
              {!stageDiff && t('noChange')}
            </Button>
          </div>
        </DetailSection>
      </div>
    </div>
  );
}
