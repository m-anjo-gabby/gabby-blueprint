'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, FileText, Loader2, LogIn, LogOut } from 'lucide-react';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { formatFileSize } from '@gabby/lib/chat/formatFileSize';
import { linkifyText } from '@gabby/lib/chat/linkifyText';
import { getSessionHomeworkAttachmentUrl } from '@gabby/lib/sessionHomework/actions/homeworkAttachmentActions';
import { SESSION_STATUS_BADGE } from '@/constants/session';
import type { SessionResultSummary } from '@gabby/types/session';
import type { SessionHomeworkAttachment, SessionHomeworkEntry } from '@gabby/types/sessionHomework';

interface Props {
  session: SessionResultSummary;
  homework: SessionHomeworkEntry[];
}

/**
 * 生徒向けセッション結果画面。コーチ向け(apps/coach/.../sessions/[sessionId]/result)と異なり
 * 閲覧専用（宿題投稿は不可。RLSでもコーチのみに制限されている）。
 */
export function StudentSessionResult({ session, homework }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const badge = SESSION_STATUS_BADGE[session.status];

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
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <span className={`inline-flex text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border ${badge.className}`}>
            {badge.label}
          </span>
          <p className="text-xs font-semibold text-slate-600">
            {formatDateTimeByZone(session.start_datetime, timezone, false)} 〜 {formatDateTimeByZone(session.end_datetime, timezone, false)}
          </p>
          <p className="text-xs font-semibold text-slate-400">{session.counterpart_name} コーチ</p>
          {session.status_note && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">メモ</p>
              <p className="text-xs text-slate-600 whitespace-pre-wrap">{session.status_note}</p>
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-800">入退室ログ</h2>
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
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-800">チャット履歴</h2>
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

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-800">宿題</h2>
          {homework.length === 0 ? (
            <p className="text-xs text-slate-400 italic">宿題はまだ投稿されていません。</p>
          ) : (
            <div className="space-y-3">
              {homework.map((entry) => (
                <div key={entry.homework_id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400">{formatDateTimeByZone(entry.insert_date, timezone, false)}</p>
                  {entry.homework_text && (
                    <p className="text-sm text-slate-700 whitespace-pre-wrap wrap-break-word">{linkifyText(entry.homework_text)}</p>
                  )}
                  {entry.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {entry.attachments.map((attachment) => (
                        <HomeworkAttachmentView key={attachment.homework_attachment_id} attachment={attachment} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
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
