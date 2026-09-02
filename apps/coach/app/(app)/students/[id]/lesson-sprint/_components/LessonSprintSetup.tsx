'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ArrowRight, Loader2, Lock, BookOpen, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QUESTION_TYPES, SPRINT_TIME_OPTIONS, SprintQuestionType, SprintAnswerType, SprintQuestion } from '@gabby/types/sprint';
import { resolveSprintHasLevel, formatSprintLevelLabel, getSprintTitle } from '@gabby/lib';
import { getLessonSprintQuestions } from '@/actions/lessonSprintAction';
import { useLessonSprintStore } from '@/stores/useLessonSprintStore';
import { useToast } from '@gabby/lib/hooks/useToast';
import type { LessonSprintContentSummary, LessonSprintHistoryListItem } from '@gabby/types/lessonSprint';
import type { StudentOverviewProfile } from '@gabby/types/coachStudent';
import { StudentSnapshotPanel } from './StudentSnapshotPanel';

interface Props {
  studentId: string;
  profile: StudentOverviewProfile;
  lessonSprints: LessonSprintHistoryListItem[];
  contents: LessonSprintContentSummary[];
  onStart: (questions: SprintQuestion[]) => void;
}

const sortedTypes = Object.values(QUESTION_TYPES).sort((a, b) => a.seq_no - b.seq_no);
const sortedTimes = Object.values(SPRINT_TIME_OPTIONS).sort((a, b) => a.seq_no - b.seq_no);

export function LessonSprintSetup({ studentId, profile, lessonSprints, contents, onStart }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const { setConfig, setContentName, setContentMetadata } = useLessonSprintStore();

  // 初期値は直近の実施条件を踏襲する。前回コンテンツが現在の一覧に無ければ先頭コンテンツにフォールバック。
  const lastSession = lessonSprints[0];
  const hasLastContent = !!lastSession && contents.some((c) => c.content_id === lastSession.content_id);

  const [contentId, setContentId] = useState<string>(
    hasLastContent ? lastSession.content_id : (contents[0]?.content_id ?? '')
  );
  const [questionType, setQuestionType] = useState<SprintQuestionType>(
    hasLastContent ? (lastSession.question_type as SprintQuestionType) : '0'
  );
  const [level, setLevel] = useState<string>(
    hasLastContent ? String(lastSession.difficulty_level) : '1'
  );
  const [timeLimitSec, setTimeLimitSec] = useState<number>(
    hasLastContent ? lastSession.time_limit_sec : QUESTION_TYPES['0'].recommendedTimeSec
  );
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
        setTimeLimitSec(firstSupported.recommendedTimeSec);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId]);

  const levelItems = useMemo(() => {
    const meta = QUESTION_TYPES[questionType];
    if (!meta || !hasLevel) return [];
    const items = [];
    for (let i = meta.minLevel; i <= meta.maxLevel; i++) {
      items.push({ value: String(i), label: formatSprintLevelLabel(questionType, i) });
    }
    return items;
  }, [questionType, hasLevel]);

  const handleTypeChange = (typeId: SprintQuestionType) => {
    setQuestionType(typeId);
    setLevel(hasLevel ? String(QUESTION_TYPES[typeId]?.minLevel ?? 0) : '1');
    setTimeLimitSec(QUESTION_TYPES[typeId].recommendedTimeSec);
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
    <>
      <main className="bg-white border border-slate-100 w-full max-w-3xl h-full max-h-[95vh] rounded-[32px] flex flex-col relative overflow-hidden shadow-2xl">
        {/* ヘッダー: 戻る・タイトル */}
        <div className="shrink-0 w-full px-6 pt-5 pb-3 border-b border-slate-100/60 bg-white relative z-10">
          <div className="flex items-center justify-between h-10">
            <button
              onClick={() => router.push(`/students/${studentId}`)}
              className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200/80 active:scale-95 cursor-pointer transition-all shrink-0"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>

            <div className="flex-1 flex flex-col items-center gap-1 px-4 min-w-0">
              <div className="inline-flex items-center max-w-full bg-slate-100/80 px-2.5 py-0.5 rounded-full">
                <span className="text-xs font-black text-indigo-600 truncate leading-none">
                  {selectedContent?.content_name || 'Select content'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <h1 className="text-sm font-black text-slate-800 tracking-tight truncate">
                  {getSprintTitle(questionType, Number(level), hasLevel)}
                </h1>
                <span className="inline-flex items-center gap-1 text-[11px] font-mono font-black px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 shrink-0">
                  <Timer size={11} className="text-amber-500" />
                  {timeLimitSec}s
                </span>
              </div>
            </div>

            <div className="h-10 w-10 shrink-0" />
          </div>
        </div>

        {/* メイン: 設定エリア */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto overscroll-contain">
          <div className="w-full max-w-2xl mx-auto flex flex-col gap-5">
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
                {sortedTimes.map((opt) => {
                  const isRecommended = opt.value === QUESTION_TYPES[questionType].recommendedTimeSec;
                  return (
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
                      {isRecommended && (
                        <div className={cn("text-[11px] font-bold", timeLimitSec === opt.value ? "text-amber-300" : "text-indigo-600")}>
                          Recommended
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
          </div>
        </div>

        {/* フッター: 開始 */}
        {contents.length > 0 && (
          <div className="shrink-0 px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-slate-100/60 bg-white">
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
        )}
      </main>

      {/* Student Snapshot: メインパネルとバランスを崩さないよう、独立したカードとして右側に配置 */}
      <aside className="hidden lg:flex flex-col w-72 h-full max-h-[95vh] overflow-y-auto">
        <StudentSnapshotPanel profile={profile} lessonSprints={lessonSprints} highlightedType={questionType} />
      </aside>
    </>
  );
}
