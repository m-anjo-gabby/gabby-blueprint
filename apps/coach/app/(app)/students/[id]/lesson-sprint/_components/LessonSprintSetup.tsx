'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Loader2, Lock, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QUESTION_TYPES, SPRINT_TIME_OPTIONS, SprintQuestionType, SprintAnswerType, SprintQuestion } from '@gabby/types/sprint';
import { resolveSprintHasLevel } from '@gabby/lib';
import { getLessonSprintQuestions } from '@/actions/lessonSprintAction';
import { useLessonSprintStore } from '@/stores/useLessonSprintStore';
import { useToast } from '@gabby/lib/hooks/useToast';
import type { LessonSprintContentSummary } from '@gabby/types/lessonSprint';

interface Props {
  studentId: string;
  studentName: string;
  contents: LessonSprintContentSummary[];
  onStart: (questions: SprintQuestion[]) => void;
}

const sortedTypes = Object.values(QUESTION_TYPES).sort((a, b) => a.seq_no - b.seq_no);
const sortedTimes = Object.values(SPRINT_TIME_OPTIONS).sort((a, b) => a.seq_no - b.seq_no);

export function LessonSprintSetup({ studentId, studentName, contents, onStart }: Props) {
  const { showToast } = useToast();
  const { setConfig, setContentName, setContentMetadata } = useLessonSprintStore();

  const [contentId, setContentId] = useState<string>(contents[0]?.content_id ?? '');
  const [questionType, setQuestionType] = useState<SprintQuestionType>('0');
  const [level, setLevel] = useState<string>('1');
  const [timeLimitSec, setTimeLimitSec] = useState<number>(90);
  const [isLoading, setIsLoading] = useState(false);

  const selectedContent = useMemo(() => contents.find((c) => c.content_id === contentId), [contents, contentId]);
  const sprintMeta = selectedContent?.metadata?.sprint;
  const isCorpus = sprintMeta?.sprint_type === '1';
  const hasLevel = resolveSprintHasLevel(sprintMeta);

  const isTypeSupported = (typeId: SprintQuestionType) => {
    if (!isCorpus || !sprintMeta?.supported_types) return true;
    const support = sprintMeta.supported_types;
    if (typeId === '0') return support.speed;
    if (typeId === '4') return support.structure;
    if (typeId === '5') return support.builders;
    if (typeId === '6') return support.mastery;
    return false;
  };

  // 教材切り替え時、選択中の種別がサポート対象外なら最初にサポートされる種別＋レベルへリセットする
  useEffect(() => {
    if (!selectedContent) return;
    if (!isTypeSupported(questionType)) {
      const firstSupported = sortedTypes.find((t) => isTypeSupported(t.value));
      if (firstSupported) {
        setQuestionType(firstSupported.value);
        setLevel(hasLevel ? String(firstSupported.minLevel) : '1');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId]);

  const levelItems = useMemo(() => {
    const meta = QUESTION_TYPES[questionType];
    if (!meta || !hasLevel) return [];
    const items = [];
    for (let i = meta.minLevel; i <= meta.maxLevel; i++) {
      items.push({ value: String(i), label: i === 0 ? 'Basic' : `Lv.${i}` });
    }
    return items;
  }, [questionType, hasLevel]);

  const handleTypeChange = (typeId: SprintQuestionType) => {
    setQuestionType(typeId);
    setLevel(hasLevel ? String(QUESTION_TYPES[typeId]?.minLevel ?? 0) : '1');
  };

  const handleStart = async (answerType: SprintAnswerType = '0') => {
    if (!contentId) {
      showToast('Please select a content first.', 'error');
      return;
    }
    setIsLoading(true);
    const difficultyLevel = hasLevel ? Number(level) : QUESTION_TYPES[questionType].minLevel;
    const result = await getLessonSprintQuestions(contentId, questionType, difficultyLevel);
    setIsLoading(false);

    if (!result.success || result.questions.length === 0) {
      showToast(!result.success ? result.message : 'No questions found for this selection.', 'error');
      return;
    }

    setConfig({
      contentId,
      questionType,
      level: String(difficultyLevel),
      timeLimitSec,
      answerType,
      // DB由来の値はランタイムで数値になっていることがあるため、明示的に文字列化する
      sprintType: String(result.questions[0]?.sprint_type ?? '0'),
    });
    setContentName(selectedContent?.content_name ?? null);
    setContentMetadata(sprintMeta ?? null);

    onStart(result.questions);
  };

  const isSpeedSelected = questionType === '0';

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="space-y-1">
        <Link
          href={`/students/${studentId}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Overview
        </Link>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Start Lesson Sprint</h1>
        <p className="text-xs text-slate-400">Configure a live sprint training for {studentName}.</p>
      </div>

      {contents.length === 0 ? (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="py-12 flex flex-col items-center text-center gap-2">
            <BookOpen size={22} className="text-slate-300" />
            <p className="text-xs font-semibold text-slate-400">No sprint content available</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-800">Content</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <Select value={contentId} onValueChange={setContentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select content" />
                </SelectTrigger>
                <SelectContent>
                  {contents.map((c) => (
                    <SelectItem key={c.content_id} value={c.content_id}>{c.content_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-800">Question Type</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {sortedTypes.map((type) => {
                  const isSelected = questionType === type.value;
                  const isSupported = isTypeSupported(type.value);
                  return (
                    <button
                      key={type.value}
                      type="button"
                      disabled={!isSupported}
                      onClick={() => handleTypeChange(type.value)}
                      className={cn(
                        "h-12 rounded-xl border text-xs font-black transition-all disabled:opacity-50 flex flex-col items-center justify-center gap-0.5",
                        isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      <span>{type.label}</span>
                      {!isSupported && (
                        <span className="flex items-center gap-0.5 text-[10px] text-rose-500"><Lock size={9} />Unavailable</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-800">Level</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {hasLevel ? (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {levelItems.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setLevel(item.value)}
                      className={cn(
                        "h-10 rounded-xl border text-xs font-black transition-all",
                        level === item.value ? "bg-indigo-600 border-indigo-600 text-white" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-semibold text-slate-400 text-center py-3">This content has no level setting</p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-800">Time Limit</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {sortedTimes.map((opt) => (
                  <button
                    key={opt.seq_no}
                    type="button"
                    onClick={() => setTimeLimitSec(opt.value)}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all",
                      timeLimitSec === opt.value ? "bg-indigo-600 border-indigo-600 text-white" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    <div className="text-xs font-black">{opt.label}</div>
                    <div className={cn("text-[11px] font-bold", timeLimitSec === opt.value ? "text-indigo-200" : "text-slate-400")}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="pb-6">
            {isSpeedSelected ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleStart('0')}
                  disabled={isLoading}
                  className="h-14 rounded-2xl font-black text-xs uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin" /> : <>Start (YES)<ArrowRight size={14} /></>}
                </button>
                <button
                  onClick={() => handleStart('1')}
                  disabled={isLoading}
                  className="h-14 rounded-2xl font-black text-xs uppercase tracking-wider bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin" /> : <>Start (NO)<ArrowRight size={14} /></>}
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleStart('0')}
                disabled={isLoading}
                className="w-full h-14 rounded-2xl font-black text-xs uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <>Start Lesson Sprint<ArrowRight size={14} /></>}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
