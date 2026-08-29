import Link from 'next/link';
import { ArrowLeft, Zap, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { tokenizeWords } from '@gabby/lib';
import { QUESTION_TYPES } from '@gabby/types/sprint';
import { LESSON_SPRINT_SCORE_META } from '@gabby/types/lessonSprint';
import type { LessonSprintRecord } from '@gabby/types/lessonSprint';
import type { SprintQuestion } from '@gabby/types/sprint';

interface Props {
  studentId: string;
  record: LessonSprintRecord;
  questions: SprintQuestion[];
}

export function LessonSprintResult({ studentId, record, questions }: Props) {
  const typeLabel = QUESTION_TYPES[record.question_type as keyof typeof QUESTION_TYPES]?.label ?? record.question_type;

  const scoredItems = record.answered_history.filter((h) => !h.is_skipped && typeof h.score === 'number');
  const averageScore = scoredItems.length > 0
    ? Math.round((scoredItems.reduce((sum, h) => sum + (h.score ?? 0), 0) / scoredItems.length) * 10) / 10
    : null;

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10">
      <div className="space-y-1">
        <Link
          href={`/students/${studentId}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Overview
        </Link>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Lesson Sprint Result</h1>
        <p className="text-xs text-slate-400">{typeLabel} · Lv.{record.difficulty_level} · {new Date(record.insert_date).toLocaleString()}</p>
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="pt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
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
        </CardContent>
      </Card>

      {record.session_note && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <StickyNote size={14} className="text-indigo-500" />
              Session Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{record.session_note}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {questions.map((question, idx) => {
          const historyItem = record.answered_history.find((h) => h.question_id === question.question_id);
          const isSpeedNo = record.answer_type === '1' && question.answer_sentence_no_en;
          const answerText = isSpeedNo ? (question.answer_sentence_no_en ?? '') : question.answer_sentence_yes_en;
          const words = tokenizeWords(answerText);
          const highlighted = historyItem?.highlighted_word_indices ?? [];
          const scoreMeta = historyItem?.score ? LESSON_SPRINT_SCORE_META[historyItem.score] : null;

          return (
            <Card key={question.question_id} className="rounded-2xl border-slate-200 shadow-sm">
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
                  <p className="text-xs text-slate-500">{question.statement_en}</p>
                )}
                <p className="text-sm font-bold text-slate-800">{question.question_en}</p>

                <div className="flex flex-wrap gap-1">
                  {words.map((word, wIdx) => (
                    <span
                      key={wIdx}
                      className={cn(
                        'px-1.5 py-0.5 rounded text-sm font-semibold',
                        highlighted.includes(wIdx) ? 'bg-rose-100 text-rose-700' : 'text-slate-600'
                      )}
                    >
                      {word}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Link
        href={`/students/${studentId}/lesson-sprint`}
        className="w-full h-12 rounded-2xl font-black text-xs uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2"
      >
        <Zap size={14} className="fill-current text-amber-300" />
        Start Another Lesson Sprint
      </Link>
    </div>
  );
}
