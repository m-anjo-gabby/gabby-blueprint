'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  FileText,
  GraduationCap,
  ListTodo,
  Loader2,
  LogIn,
  LogOut,
  MessageCircle,
  MessageSquareText,
  Rocket,
} from 'lucide-react';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useToast } from '@gabby/lib/hooks/useToast';
import { formatFileSize } from '@gabby/lib/chat/formatFileSize';
import { linkifyText } from '@gabby/lib/chat/linkifyText';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { getSessionHomeworkAttachmentUrl } from '@gabby/lib/sessionHomework/actions/homeworkAttachmentActions';
import { updateHomeworkChecklistItemStatus } from '@/actions/sessionHomeworkAction';
import { Progress } from '@/components/ui/progress';
import type { SessionResultSummary } from '@gabby/types/session';
import type { SessionHomeworkAttachment, SessionHomeworkChecklistItem, SessionHomeworkEntry } from '@gabby/types/sessionHomework';

interface Props {
  session: SessionResultSummary;
  homework: SessionHomeworkEntry | null;
  checklist: SessionHomeworkChecklistItem[];
}

/**
 * セクション見出し（アイコンバッジ+タイトル）。コーチ向け画面と視覚言語を揃えつつ、
 * 本画面はスマホ幅のカード1枚のUIのため、コーチ側のような横幅グリッドは使わず縦積みにする。
 */
function SectionHeading({ icon: Icon, iconClassName, title }: { icon: typeof BookOpen; iconClassName: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 ${iconClassName}`}>
        <Icon size={15} />
      </span>
      <h2 className="text-sm font-bold text-slate-800">{title}</h2>
    </div>
  );
}

/**
 * 生徒向けセッション結果画面。コーチ向け(apps/coach/.../sessions/[sessionId]/result)と異なり
 * 宿題本体・フォローアップコメント・添付ファイルの投稿は不可（RLSでもコーチのみに制限されている）。
 * ただし宿題チェックリストの完了状態（ON/OFF）のみ生徒本人が更新できる。
 * セクションは優先度順（サマリー→宿題→トレーニング→チャット履歴）に並べる。
 */
export function StudentSessionResult({ session, homework, checklist: initialChecklist }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const { showToast } = useToast();
  const [checklist, setChecklist] = useState(initialChecklist);
  const [showCallLog, setShowCallLog] = useState(false);
  const coachIconUrl = getProfileIconUrl(session.counterpart_icon_path);
  const doneCount = checklist.filter((item) => item.is_done).length;
  const progressPercent = checklist.length > 0 ? (doneCount / checklist.length) * 100 : 0;

  const handleToggleChecklistItem = async (checklistItemId: string, isDone: boolean) => {
    // 楽観的更新。失敗時は元の状態に戻す。
    setChecklist((prev) => prev.map((item) => (item.checklist_item_id === checklistItemId ? { ...item, is_done: isDone } : item)));

    const res = await updateHomeworkChecklistItemStatus(checklistItemId, isDone);
    if (!res.success) {
      showToast(res.message, 'error');
      setChecklist((prev) => prev.map((item) => (item.checklist_item_id === checklistItemId ? { ...item, is_done: !isDone } : item)));
    }
  };

  return (
    <div className="flex flex-col w-full max-w-2xl h-full bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
      <header className="px-5 sm:px-8 pt-6 sm:pt-8 pb-6 border-b border-slate-50 space-y-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/live-room"
            className="p-2 -ml-2 hover:bg-slate-100 rounded-2xl transition-all active:scale-90 text-slate-400 shrink-0"
          >
            <ChevronLeft size={24} />
          </Link>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">セッション結果</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 bg-slate-50/50 space-y-4">
        {/* サマリー: 見出しラベルは付けず、いつ・誰とのセッションかを最優先で大きく見せる */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="space-y-3">
            <p className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              {formatDateTimeByZone(session.start_datetime, timezone, false)} 〜 {formatDateTimeByZone(session.end_datetime, timezone, false)}
            </p>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 overflow-hidden flex items-center justify-center text-indigo-500 shrink-0">
                {coachIconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coachIconUrl} alt={session.counterpart_name} className="w-full h-full object-cover" />
                ) : (
                  <GraduationCap size={20} />
                )}
              </div>
              <p className="text-sm sm:text-base font-black text-slate-800">{session.counterpart_name} コーチ</p>
            </div>
          </div>

          <div className="pt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowCallLog((prev) => !prev)}
              className="w-full flex items-center justify-between gap-2 pt-2 text-left"
            >
              <span className="text-xs font-bold text-slate-500">
                入退室ログ{session.call_log.length > 0 && `（${session.call_log.length}件）`}
              </span>
              <motion.span animate={{ rotate: showCallLog ? 180 : 0 }} className="text-slate-400 shrink-0">
                <ChevronDown size={16} />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {showCallLog && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2.5">
                    {session.call_log.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">通話記録はありません。</p>
                    ) : (
                      <ul className="space-y-2">
                        {session.call_log.map((entry) => (
                          <li key={entry.call_log_id} className="flex items-start gap-2 text-xs">
                            <span className={`mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${entry.role === 'coach' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                              {entry.left_at ? <LogOut size={11} /> : <LogIn size={11} />}
                            </span>
                            <span className="text-slate-600">
                              <span className="font-bold">{entry.role === 'coach' ? 'コーチ' : '自分'}</span>{' '}
                              入室 {formatDateTimeByZone(entry.joined_at, timezone, false)}
                              {entry.left_at ? <> ・ 退室 {formatDateTimeByZone(entry.left_at, timezone, false)}</> : <> ・ 接続中</>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* 宿題（指示・チェックリスト・フォローアップコメントを1セクションに集約） */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <SectionHeading icon={BookOpen} iconClassName="bg-indigo-50 text-indigo-600" title="宿題" />

          {!homework ? (
            <p className="text-xs text-slate-400 italic">まだ宿題はありません。</p>
          ) : (
            <>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3 space-y-2">
                <p className="text-[10px] font-bold text-slate-400">{formatDateTimeByZone(homework.insert_date, timezone, false)}</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap wrap-break-word">{linkifyText(homework.homework_text)}</p>
                {homework.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {homework.attachments.map((attachment) => (
                      <HomeworkAttachmentView key={attachment.homework_attachment_id} attachment={attachment} />
                    ))}
                  </div>
                )}
              </div>

              {checklist.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <ListTodo size={13} />
                      <p className="text-xs font-bold">チェックリスト</p>
                    </div>
                    <span className="text-[11px] font-black text-indigo-600 tabular-nums shrink-0">
                      {doneCount}/{checklist.length} 完了
                    </span>
                  </div>

                  <Progress value={progressPercent} className="h-1.5" />

                  <ul className="space-y-2">
                    <AnimatePresence initial={false}>
                      {checklist.map((item) => (
                        <motion.li
                          key={item.checklist_item_id}
                          layout
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleChecklistItem(item.checklist_item_id, !item.is_done)}
                            className={`w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors active:scale-[0.99] ${
                              item.is_done
                                ? 'bg-emerald-50/60 border-emerald-100'
                                : 'bg-white border-slate-100 hover:bg-slate-50'
                            }`}
                          >
                            <span
                              className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                item.is_done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'
                              }`}
                            >
                              <AnimatePresence>
                                {item.is_done && (
                                  <motion.span
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    exit={{ scale: 0 }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                                  >
                                    <Check size={12} className="text-white" strokeWidth={3} />
                                  </motion.span>
                                )}
                              </AnimatePresence>
                            </span>
                            <span className={`text-sm flex-1 ${item.is_done ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>
                              {item.item_text}
                            </span>
                          </button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>

                  {doneCount === checklist.length && (
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl px-3.5 py-2.5">
                      <CheckCircle2 size={15} className="shrink-0" />
                      宿題を全て完了しました！お疲れ様でした。
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2.5 pt-1 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-500 pt-2">
                  <MessageSquareText size={13} />
                  <p className="text-xs font-bold">フォローアップコメント</p>
                </div>

                {homework.comments.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">フォローアップコメントはまだありません。</p>
                ) : (
                  <div className="space-y-3">
                    {homework.comments.map((comment) => (
                      <div key={comment.comment_id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3 space-y-2">
                        <p className="text-[10px] font-bold text-slate-400">{formatDateTimeByZone(comment.insert_date, timezone, false)}</p>
                        {comment.comment_text && (
                          <p className="text-sm text-slate-700 whitespace-pre-wrap wrap-break-word">{linkifyText(comment.comment_text)}</p>
                        )}
                        {comment.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {comment.attachments.map((attachment) => (
                              <HomeworkAttachmentView key={attachment.homework_attachment_id} attachment={attachment} />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* トレーニング（Live Sprint・ダイアログ練習） */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <SectionHeading icon={Rocket} iconClassName="bg-amber-50 text-amber-600" title="トレーニング" />

          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-500">Live Sprint</p>
            {session.sprint_log.length === 0 ? (
              <p className="text-xs text-slate-400 italic">このセッションでは実施されませんでした。</p>
            ) : (
              <ul className="space-y-2">
                {session.sprint_log.map((entry) => (
                  <li key={entry.lesson_sprint_id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{entry.content_name}</p>
                      <p className="text-[11px] text-slate-400">{formatDateTimeByZone(entry.insert_date, timezone, false)}</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-1">
                      {entry.average_score !== null ? `${entry.average_score}/5` : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/*
            ダイアログ練習: 実装時期未定のため非表示。実装時は下記を復活させる。
            <div className="space-y-2 pt-1 border-t border-slate-100 border-dashed">
              <div className="flex items-center gap-1.5 pt-2">
                <p className="text-xs font-bold text-slate-400">ダイアログ練習</p>
                <span className="text-[9px] font-black uppercase tracking-wide text-slate-400 bg-slate-100 border border-slate-200 rounded-full px-1.5 py-0.5">
                  近日公開
                </span>
              </div>
              <p className="text-xs text-slate-400 italic">近日公開予定です。</p>
            </div>
          */}
        </section>

        {/* チャット履歴 */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <SectionHeading icon={MessageCircle} iconClassName="bg-sky-50 text-sky-600" title="チャット履歴" />
          {session.chat_log.length === 0 ? (
            <p className="text-xs text-slate-400 italic">通話中のチャットメッセージはありません。</p>
          ) : (
            <ul className="space-y-2">
              {session.chat_log.map((entry) => (
                <li key={entry.chat_id} className={`text-xs ${entry.sender_role === 'student' ? 'text-right' : 'text-left'}`}>
                  <p className="font-bold text-slate-400 text-[10px]">{entry.sender_role === 'coach' ? 'コーチ' : '自分'}</p>
                  <p
                    className={`inline-block mt-0.5 px-2.5 py-1.5 rounded-lg whitespace-pre-wrap wrap-break-word ${
                      entry.sender_role === 'student' ? 'bg-indigo-50 text-indigo-700' : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {entry.message}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function HomeworkAttachmentView({ attachment }: { attachment: SessionHomeworkAttachment }) {
  const isImage = attachment.file_type.startsWith('image/');
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSessionHomeworkAttachmentUrl(attachment.file_path).then((res) => {
      if (!cancelled) {
        setUrl(res.url);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attachment.file_path]);

  if (isLoading) {
    return <Loader2 size={16} className="animate-spin text-slate-400" />;
  }

  if (!url) {
    return <p className="text-xs text-slate-400">添付ファイルの読み込みに失敗しました</p>;
  }

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={attachment.file_name} className="max-w-60 max-h-60 rounded-lg object-cover" />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-xs text-indigo-600 underline underline-offset-2"
    >
      <FileText size={16} className="shrink-0" />
      <span className="truncate">{attachment.file_name}</span>
      <span className="text-[10px] opacity-70 shrink-0">{formatFileSize(attachment.file_size)}</span>
    </a>
  );
}
