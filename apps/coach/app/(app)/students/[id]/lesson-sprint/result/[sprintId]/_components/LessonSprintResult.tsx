import Link from 'next/link';
import { ArrowLeft, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { tokenizeWordsWithPunctuation, formatSprintLevelLabel } from '@gabby/lib';
import { QUESTION_TYPES } from '@gabby/types/sprint';
import { LESSON_SPRINT_SCORE_META } from '@gabby/types/lessonSprint';
import type { LessonSprintRecord, LessonSprintContentSummary } from '@gabby/types/lessonSprint';
import type { SprintQuestion } from '@gabby/types/sprint';
import { SessionNoteCard } from './SessionNoteCard';
import { RepeatSprintButton } from './RepeatSprintButton';

interface Props {
  studentId: string;
  record: LessonSprintRecord;
  questions: SprintQuestion[];
  content: LessonSprintContentSummary | undefined;
}

export function LessonSprintResult({ studentId, record, questions, content }: Props) {
  const typeLabel = QUESTION_TYPES[record.question_type as keyof typeof QUESTION_TYPES]?.label ?? record.question_type;
  const isQuestionBased = record.question_type === '0' || record.question_type === '6';

  const scoredItems = record.answered_history.filter((h) => !h.is_skipped && typeof h.score === 'number');
  const averageScore = scoredItems.length > 0
    ? Math.round((scoredItems.reduce((sum, h) => sum + (h.score ?? 0), 0) / scoredItems.length) * 10) / 10
    : null;

  const formattedDate = new Date(record.insert_date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="flex flex-col lg:h-full max-w-7xl mx-auto w-full pb-6 lg:pb-0">
      {/* ────────────── Header area: navigation + screen title ────────────── */}
      <div className="space-y-1 pb-6 shrink-0">
        <Link
          href={`/students/${studentId}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Overview
        </Link>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Lesson Sprint Result</h1>
      </div>

      {/* ────────────── Main content: two-pane layout. On lg+, each pane scrolls independently within a fixed-height row. ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6 lg:flex-1 lg:min-h-0 lg:items-stretch">
        {/* Left pane: overview, session notes, next action (rarely needs to scroll, but scrolls internally if it ever overflows) */}
        <div className="flex flex-col gap-4 lg:overflow-y-auto lg:min-h-0 lg:pr-1">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-wider">Summary</h2>
          </div>

          <Card className="rounded-2xl border-slate-200 shadow-sm shrink-0">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-800">{typeLabel}</span>
                <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 rounded-full px-2.5 py-0.5">
                  {formatSprintLevelLabel(record.question_type, record.difficulty_level)}
                </span>
              </div>
              <p className="text-xs text-slate-400">{formattedDate}</p>

              <div className="grid grid-cols-2 gap-4 text-center pt-3 border-t border-slate-100">
                <div>
                  <p className="text-2xl font-black text-slate-800">{record.total_answered}</p>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Answered</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-800">{record.total_evaluated}</p>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Evaluated</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-indigo-600">{averageScore ?? '—'}{averageScore !== null && <span className="text-sm text-slate-400">/5</span>}</p>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Avg Score</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-800">{record.time_limit_sec}s</p>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Time Limit</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <SessionNoteCard lessonSprintId={record.lesson_sprint_id} initialNote={record.session_note} />

          <div className="space-y-2">
            <RepeatSprintButton studentId={studentId} record={record} content={content} />
            <Link
              href={`/students/${studentId}/lesson-sprint`}
              className="w-full h-12 rounded-2xl font-black text-xs uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 shrink-0"
            >
              <Zap size={14} className="fill-current text-amber-300" />
              Start Another Lesson Sprint
            </Link>
          </div>
        </div>

        {/* Right pane: scrollable answer history */}
        <div className="min-w-0 flex flex-col gap-3 lg:overflow-y-auto lg:min-h-0 lg:pr-1">
          <div className="flex items-center justify-between px-1 shrink-0">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-wider">Answer History</h2>
            <span className="text-xs text-slate-400">{questions.length} questions</span>
          </div>

          {questions.map((question, idx) => {
            const historyItem = record.answered_history.find((h) => h.question_id === question.question_id);
            const isSpeedNo = record.answer_type === '1' && question.answer_sentence_no_en;
            const answerText = isSpeedNo ? (question.answer_sentence_no_en ?? '') : question.answer_sentence_yes_en;
            const words = tokenizeWordsWithPunctuation(answerText);
            const highlighted = historyItem?.highlighted_word_indices ?? [];
            const scoreMeta = historyItem?.score ? LESSON_SPRINT_SCORE_META[historyItem.score] : null;

            return (
              <Card key={question.question_id} className="rounded-2xl border-slate-200 shadow-sm shrink-0">
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Q{idx + 1}</span>
                    {historyItem?.is_skipped ? (
                      <span className="text-[11px] font-black text-slate-400 bg-slate-100 rounded-full px-2.5 py-1">Skipped</span>
                    ) : scoreMeta ? (
                      <span
                        className="text-[11px] font-black rounded-full px-2.5 py-1"
                        style={{ backgroundColor: `${scoreMeta.color}1a`, color: scoreMeta.color }}
                      >
                        {historyItem?.score}/5 · {scoreMeta.label}
                      </span>
                    ) : null}
                  </div>

                  {question.statement_en && (
                    <div className="border-l-4 border-slate-200 pl-3 py-0.5">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Statement</p>
                      <p className="text-sm font-semibold text-slate-600 leading-relaxed">{question.statement_en}</p>
                    </div>
                  )}

                  <div className="border-l-4 border-indigo-500 pl-3 py-0.5">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-wider mb-1">
                      {isQuestionBased ? 'Question' : 'Instruction'}
                    </p>
                    <p className="text-base font-black text-slate-800 leading-snug">{question.question_en}</p>
                  </div>

                  <div
                    className={cn(
                      'border-l-4 pl-3 pr-3 py-2.5 rounded-r-lg',
                      isSpeedNo ? 'border-amber-500 bg-amber-50/40' : 'border-emerald-500 bg-emerald-50/40'
                    )}
                  >
                    <p
                      className={cn(
                        'text-[10px] font-black uppercase tracking-wider mb-1',
                        isSpeedNo ? 'text-amber-500' : 'text-emerald-500'
                      )}
                    >
                      Answer
                    </p>
                    <p className={cn('text-base font-bold leading-relaxed', isSpeedNo ? 'text-amber-700' : 'text-emerald-700')}>
                      {words.map((word, wIdx) => (
                        <span key={wIdx}>
                          <span
                            className={cn(
                              highlighted.includes(wIdx) && 'px-1 py-0.5 rounded bg-rose-100 text-rose-700'
                            )}
                          >
                            {word}
                          </span>
                          {wIdx < words.length - 1 ? ' ' : ''}
                        </span>
                      ))}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
