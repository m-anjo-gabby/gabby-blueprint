'use client';

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@gabby/lib/hooks/useToast';
import { Loader2, Rocket, TriangleAlert } from 'lucide-react';
import {
  getStudentSprintProgress,
  updateStudentSprintLevel,
  setStudentSprintStage,
} from '@/actions/adminStudentProgressAction';
import { QUESTION_TYPES, SprintQuestionType } from '@gabby/types/sprint';
import { MAX_STAGE, StageLevels } from '@gabby/types/stageProgression';
import { getStageGaps, getStageGoals } from '@gabby/lib/sprint/stageProgression';
import type { StudentSprintProgress } from '@gabby/types/coachStudent';
import { UserRecord } from '@gabby/types/user';

interface Props {
  user: UserRecord;
  children: React.ReactNode;
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

export function SprintProgressFormDialog({ user, children }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<StudentSprintProgress | null>(null);
  const [levelSelections, setLevelSelections] = useState<Partial<Record<SprintQuestionType, number>>>({});
  const [savingType, setSavingType] = useState<SprintQuestionType | null>(null);
  const [targetStage, setTargetStage] = useState<number | null>(null);
  const [isSavingStage, setIsSavingStage] = useState(false);
  const { showToast } = useToast();

  const levels = progress ? toStageLevels(progress) : null;

  const stageOptions = useMemo(() => Array.from({ length: MAX_STAGE + 1 }, (_, i) => i), []);

  const stageDiff = useMemo(() => {
    if (!levels || targetStage === null || !progress || targetStage === progress.stage) return null;
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

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setLoading(true);
      try {
        const data = await getStudentSprintProgress(user.id);
        setProgress(data);
        setTargetStage(data.stage);
        setLevelSelections({});
      } finally {
        setLoading(false);
      }
    } else {
      setProgress(null);
      setLevelSelections({});
      setTargetStage(null);
    }
  };

  const handleLevelSave = async (questionType: SprintQuestionType) => {
    if (!levels) return;
    const meta = QUESTION_TYPES[questionType];
    const newLevel = levelSelections[questionType] ?? levels[questionType];
    if (newLevel === levels[questionType]) return;

    setSavingType(questionType);
    try {
      const result = await updateStudentSprintLevel(user.id, questionType, newLevel);
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
      showToast(`${meta.label} を ${levelLabel(questionType, newLevel)} に変更しました`, 'success');
    } finally {
      setSavingType(null);
    }
  };

  const handleStageSave = async () => {
    if (targetStage === null || !progress || targetStage === progress.stage) return;
    setIsSavingStage(true);
    try {
      const result = await setStudentSprintStage(user.id, targetStage);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      setProgress(result.progress);
      setTargetStage(result.progress.stage);
      showToast(`ステージを Stage ${result.progress.stage} に変更しました`, 'success');
    } finally {
      setIsSavingStage(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md p-0 shadow-2xl border-none [&>button]:text-white [&>button]:opacity-70 max-h-[90vh] flex flex-col rounded-xl overflow-hidden">
        <DialogHeader className="p-6 bg-slate-900 text-white">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Rocket size={18} className="text-indigo-400" /> ステージ・レベル管理
          </DialogTitle>
          <p className="text-slate-400 text-[11px] font-bold mt-1">{user.user_name} / {user.client_name}</p>
        </DialogHeader>

        <div className="p-6 flex-1 overflow-y-auto min-h-[380px]">
          {loading || !progress || !levels ? (
            <div className="h-full flex items-center justify-center text-slate-400">
              <Loader2 size={32} className="animate-spin" />
            </div>
          ) : (
            <Tabs defaultValue="levels">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="levels">問題種別ごと</TabsTrigger>
                <TabsTrigger value="stage">ステージ</TabsTrigger>
              </TabsList>

              <TabsContent value="levels" className="mt-0 space-y-1">
                {TYPE_ORDER.map((type) => {
                  const currentLevel = levels[type.value];
                  const options = Array.from(
                    { length: type.maxLevel - type.minLevel + 1 },
                    (_, i) => type.minLevel + i
                  );
                  const selected = levelSelections[type.value] ?? currentLevel;

                  return (
                    <div
                      key={type.value}
                      className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-700">{type.label}</p>
                        <p className="text-xs text-slate-400">現在: {levelLabel(type.value, currentLevel)}</p>
                      </div>
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
                          onClick={() => handleLevelSave(type.value)}
                          disabled={savingType !== null || selected === currentLevel}
                        >
                          {savingType === type.value && <Loader2 size={14} className="animate-spin" />}
                          保存
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </TabsContent>

              <TabsContent value="stage" className="mt-0 space-y-4">
                <p className="text-sm text-slate-600">
                  現在のステージ: <span className="font-bold text-slate-800">Stage {progress.stage}</span>
                </p>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">目標ステージ</label>
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
                          {s === progress.stage ? '（現在）' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {stageDiff?.direction === 'up' && (
                  stageDiff.gaps.length > 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                        <TriangleAlert size={13} />
                        <span>到達条件を満たしていない種別があります</span>
                      </div>
                      <p className="text-xs text-amber-700">
                        Stage {targetStage} へ強制的に到達させると、以下のレベルが必要な最小値まで引き上げられます。
                        条件を満たしている種別は変更されません。
                      </p>
                      <ul className="text-xs text-amber-800 space-y-0.5">
                        {stageDiff.gaps.map((gap) => (
                          <li key={gap.questionType} className="font-semibold">
                            {QUESTION_TYPES[gap.questionType].label}: {levelLabel(gap.questionType, gap.current)} →{' '}
                            {levelLabel(gap.questionType, gap.required)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-emerald-600">
                      Stage {targetStage} の到達条件はすでに満たされています。
                    </p>
                  )
                )}

                {stageDiff?.direction === 'down' && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700">
                      <TriangleAlert size={13} />
                      <span>レベルがダウンします</span>
                    </div>
                    <p className="text-xs text-rose-700">
                      Stage {targetStage} まで引き下げると、以下の問題種別のレベルが Stage {targetStage} ちょうどの基準値にリセットされます。
                    </p>
                    {stageDiff.resets.length > 0 ? (
                      <ul className="text-xs text-rose-800 space-y-0.5">
                        {stageDiff.resets.map((reset) => (
                          <li key={reset.questionType} className="font-semibold">
                            {QUESTION_TYPES[reset.questionType].label}: {levelLabel(reset.questionType, reset.current)} →{' '}
                            {levelLabel(reset.questionType, reset.next)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-rose-700">変更されるレベルはありません。</p>
                    )}
                  </div>
                )}

                <Button
                  type="button"
                  onClick={handleStageSave}
                  disabled={isSavingStage || !stageDiff}
                  className="w-full"
                >
                  {isSavingStage && <Loader2 size={14} className="animate-spin" />}
                  {stageDiff?.direction === 'up' && 'ステージを強制的に上げる'}
                  {stageDiff?.direction === 'down' && 'ステージを引き下げる'}
                  {!stageDiff && '変更なし'}
                </Button>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
