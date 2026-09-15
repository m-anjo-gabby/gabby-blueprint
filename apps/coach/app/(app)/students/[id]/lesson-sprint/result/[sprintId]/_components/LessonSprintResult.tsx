'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Zap, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { tokenizeWordsWithPunctuation, formatSprintLevelLabel, resolveCoachContentName } from '@gabby/lib';
import { formatDateTimeEn } from '@gabby/lib/date/dateEn';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
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
  /**
   * URLの?session_id=。ハブ発のLive Sprintをちょうど完走してこの結果画面に遷移してきた
   * 場合のみ渡ってくる（LessonSprintApp.handleComplete参照）。受講生概要のスプリント履歴や
   * ハブのPrepセクションから過去の記録を振り返る目的で開いた場合は、その実施が
   * record.session_idを持っていてもnullのまま＝表示・導線を一切変えない。
   */
  sessionId: string | null;
  /**
   * URLの?back=/?back_label=。この結果画面へ実際に遷移してきた元の画面（生徒概要／
   * ライブセッション結果画面／セッションハブのPrepセクション等）を呼び出し側から明示的に
   * 引き継ぐ。両方揃っている場合のみ使用し、無ければrecord.session_idに基づく推測に
   * フォールバックする（すべてのリンク元を更新し切れていない場合の保険）。
   * 没入表示（isImmersive）の場合は、ライブセッション中のハブへ戻る導線に一切影響を
   * 与えないよう、これらのパラメータは無視する。
   */
  backHref: string | null;
  backLabel: string | null;
}

export function LessonSprintResult({ studentId, record, questions, content, sessionId, backHref: backHrefParam, backLabel: backLabelParam }: Props) {
  const timezone = useTimezone();
  const typeLabel = QUESTION_TYPES[record.question_type as keyof typeof QUESTION_TYPES]?.label ?? record.question_type;
  const isQuestionBased = record.question_type === '0' || record.question_type === '6';
  const isImmersive = !!sessionId;

  const scoredItems = record.answered_history.filter((h) => !h.is_skipped && typeof h.score === 'number');
  const averageScore = scoredItems.length > 0
    ? Math.round((scoredItems.reduce((sum, h) => sum + (h.score ?? 0), 0) / scoredItems.length) * 10) / 10
    : null;

  const formattedDate = formatDateTimeEn(record.insert_date, timezone);

  // ハブ発の実施を完走した直後（isImmersive）は、セッションハブへ戻る一本道の導線にする
  // （コーチからの「通話中はなるべく画面を行き来したくない」という要望を受けた設計。詳細は
  // SessionHub.tsxのコメント参照）。ここは呼び出し元に関わらず常に固定で、backHref/backLabel
  // パラメータの影響を受けない。
  // それ以外（履歴からの参照）は、実際に遷移してきた画面（back）が分かっていればそこへ戻す。
  // 分からない場合のみ、このスプリントがライブセッションに紐づいていればそのセッション結果
  // 画面、紐づきが無い(単独実施)場合は受講生概要に戻る、という推測にフォールバックする。
  const backHref = isImmersive
    ? `/students/${studentId}/sessions/${sessionId}`
    : backHrefParam ?? (record.session_id ? `/students/${studentId}/sessions/${record.session_id}/result` : `/students/${studentId}`);
  const backLabel = isImmersive
    ? 'Back to Hub'
    : backLabelParam ?? (record.session_id ? 'Back to Session Result' : 'Back to Overview');

  const body = (
    <div className="flex flex-col lg:h-full max-w-7xl mx-auto w-full pb-6 lg:pb-0">
      {/* ────────────── Header area: navigation + screen title ────────────── */}
      <div className="space-y-1 pb-6 shrink-0">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ArrowLeft size={14} />
          {backLabel}
        </Link>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Live Sprint Result</h1>
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
              {content && (
                <h3 className="text-base font-black text-slate-800 truncate">{resolveCoachContentName(content)}</h3>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-800">{typeLabel}</span>
                <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 rounded-full px-2.5 py-0.5">
                  {formatSprintLevelLabel(record.question_type, record.difficulty_level)}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-mono font-black text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                  <Timer size={11} className="text-amber-500" />
                  {record.time_limit_sec}s
                </span>
              </div>
              <p className="text-xs text-slate-400">{formattedDate}</p>

              <div className="grid grid-cols-2 gap-4 text-center pt-3 border-t border-slate-100">
                <div>
                  <p className="text-2xl font-black text-slate-800">{record.total_answered}</p>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Answered</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-indigo-600">{averageScore ?? '—'}{averageScore !== null && <span className="text-sm text-slate-400">/5</span>}</p>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Avg Score</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <SessionNoteCard lessonSprintId={record.lesson_sprint_id} initialNote={record.session_note} />

          {/* 次のアクション（Repeat/Start Another）は、今まさにハブのセッション文脈内にいる
              （＝通話中に続けてもう1本実施しうる）場合にのみ意味を持つ。履歴からの参照時は
              非表示にする（コーチからのフィードバックを受けて追加）。 */}
          {isImmersive && (
            <div className="lg:sticky lg:bottom-0 lg:bg-white lg:border-t lg:border-slate-100 lg:pt-3 space-y-2">
              <RepeatSprintButton studentId={studentId} record={record} content={content} sessionId={sessionId} />
              <Link
                href={`/students/${studentId}/lesson-sprint?session_id=${sessionId}`}
                className="w-full h-12 rounded-2xl font-black text-xs uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 shrink-0"
              >
                <Zap size={14} className="fill-current text-amber-300" />
                Start Another Live Sprint
              </Link>
              {/* ボタン群と並べて同じ「Back to Hub」を重複表示すると紛らわしいため、
                  ここでは「これ以上スプリントを続けない場合の締めくくり」という文脈の文言にする */}
              <Link
                href={backHref}
                className="w-full flex items-center justify-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors py-1"
              >
                Done for now — back to Hub
                <ArrowRight size={12} />
              </Link>
            </div>
          )}
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

  if (!isImmersive) return body;

  // ハブ発の実施を完走した直後は、Header/Sidebarを覆う固定オーバーレイで表示し、通話中の
  // 画面遷移を最小限にする（Setup/Player画面（LessonSprintApp.tsx）と同じ手法で統一）。
  return (
    <div className="fixed inset-0 z-40 w-full h-full bg-slate-50 overflow-y-auto p-4 md:p-6">
      {body}
    </div>
  );
}
