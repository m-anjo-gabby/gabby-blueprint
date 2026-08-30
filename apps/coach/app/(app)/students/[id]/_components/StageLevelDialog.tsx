'use client';

import { useMemo, useState } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useToast } from '@gabby/lib/hooks/useToast';
import { updateStudentSprintLevel, forceStageUpStudent } from '@/actions/studentAction';
import { QUESTION_TYPES, SprintQuestionType } from '@gabby/types/sprint';
import { MAX_STAGE, StageLevels } from '@gabby/types/stageProgression';
import { getStageGaps } from '@gabby/lib/sprint/stageProgression';
import type { StudentSprintProgress } from '@gabby/types/coachStudent';

interface Props {
  studentId: string;
  progress: StudentSprintProgress;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (progress: StudentSprintProgress) => void;
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

function levelLabel(questionType: SprintQuestionType, level: number): string {
  return level === 0 && QUESTION_TYPES[questionType].hasBasic ? 'Basic' : `Lv.${level}`;
}

export function StageLevelDialog({ studentId, progress, open, onOpenChange, onUpdated }: Props) {
  const { showToast } = useToast();
  const levels = toStageLevels(progress);
  const [levelSelections, setLevelSelections] = useState<Partial<Record<SprintQuestionType, number>>>({});
  const [savingType, setSavingType] = useState<SprintQuestionType | null>(null);
  const [targetStage, setTargetStage] = useState<number | null>(
    progress.stage < MAX_STAGE ? progress.stage + 1 : null
  );
  const [isForcingStage, setIsForcingStage] = useState(false);

  const stageOptions = useMemo(
    () => Array.from({ length: MAX_STAGE - progress.stage }, (_, i) => progress.stage + 1 + i),
    [progress.stage]
  );

  const gaps = useMemo(
    () => (targetStage ? getStageGaps(targetStage, levels) : []),
    [targetStage, levels]
  );

  const handleLevelUp = async (questionType: SprintQuestionType) => {
    const meta = QUESTION_TYPES[questionType];
    const currentLevel = levels[questionType];
    const newLevel = levelSelections[questionType] ?? Math.min(currentLevel + 1, meta.maxLevel);
    setSavingType(questionType);
    try {
      const result = await updateStudentSprintLevel(studentId, questionType, newLevel);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onUpdated(result.progress);
      // 更新後は選択肢リストが変わる（現在レベルは選択肢に含めないため）ため、
      // 古い選択値を保持しているとSelect表示がブランクになる。次回開いた際の
      // デフォルト値（現在レベル+1）に委ねるよう選択状態をリセットする。
      setLevelSelections((prev) => {
        const next = { ...prev };
        delete next[questionType];
        return next;
      });
      showToast(`${meta.label} raised to ${levelLabel(questionType, newLevel)}.`, 'success');
    } finally {
      setSavingType(null);
    }
  };

  const handleStageUp = async () => {
    if (!targetStage) return;
    setIsForcingStage(true);
    try {
      const result = await forceStageUpStudent(studentId, targetStage);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onUpdated(result.progress);
      showToast(`Stage advanced to Stage ${result.progress.stage}.`, 'success');
    } finally {
      setIsForcingStage(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Sprint Levels</DialogTitle>
          <DialogDescription>
            Raise this student&apos;s level per question type, or advance their overall stage.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="levels">
          <TabsList>
            <TabsTrigger value="levels">By Question Type</TabsTrigger>
            <TabsTrigger value="stage">Stage</TabsTrigger>
          </TabsList>

          <TabsContent value="levels" className="space-y-1">
            {TYPE_ORDER.map((type) => {
              const currentLevel = levels[type.value];
              const isMax = currentLevel >= type.maxLevel;
              const options = Array.from(
                { length: type.maxLevel - currentLevel },
                (_, i) => currentLevel + 1 + i
              );
              const selected = levelSelections[type.value] ?? options[0] ?? currentLevel;

              return (
                <div
                  key={type.value}
                  className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{type.label}</p>
                    <p className="text-xs text-slate-400">Current: {levelLabel(type.value, currentLevel)}</p>
                  </div>
                  {isMax ? (
                    <span className="text-xs font-semibold text-slate-300">Max level reached</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Select
                        value={String(selected)}
                        onValueChange={(v) =>
                          setLevelSelections((prev) => ({ ...prev, [type.value]: Number(v) }))
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((lv) => (
                            <SelectItem key={lv} value={String(lv)}>
                              {levelLabel(type.value, lv)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleLevelUp(type.value)}
                        disabled={savingType !== null}
                      >
                        {savingType === type.value && <Loader2 size={14} className="animate-spin" />}
                        Level Up
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="stage" className="space-y-4">
            <p className="text-sm text-slate-600">
              Current stage: <span className="font-bold text-slate-800">Stage {progress.stage}</span>
            </p>

            {!targetStage ? (
              <p className="text-xs font-semibold text-slate-400">
                This student has already reached the maximum stage.
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Target stage</Label>
                  <Select value={String(targetStage)} onValueChange={(v) => setTargetStage(Number(v))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stageOptions.map((s) => (
                        <SelectItem key={s} value={String(s)}>
                          Stage {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {gaps.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                      <TriangleAlert size={13} />
                      <span>Requirements not yet met</span>
                    </div>
                    <p className="text-xs text-amber-700">
                      Forcing this stage up will raise the following levels to the minimum required value.
                      Question types that already meet the requirement will not be changed.
                    </p>
                    <ul className="text-xs text-amber-800 space-y-0.5">
                      {gaps.map((gap) => (
                        <li key={gap.questionType} className="font-semibold">
                          {QUESTION_TYPES[gap.questionType].label}: {levelLabel(gap.questionType, gap.current)} →{' '}
                          {levelLabel(gap.questionType, gap.required)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs font-semibold text-emerald-600">
                    All requirements for Stage {targetStage} are already met.
                  </p>
                )}

                <Button type="button" onClick={handleStageUp} disabled={isForcingStage} className="w-full">
                  {isForcingStage && <Loader2 size={14} className="animate-spin" />}
                  {gaps.length > 0 ? `Force Advance to Stage ${targetStage}` : `Advance to Stage ${targetStage}`}
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
