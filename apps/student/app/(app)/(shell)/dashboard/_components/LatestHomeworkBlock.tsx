'use client';

import { MessageSquareText, Paperclip } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { clientLogger } from '@gabby/lib/logger/client';
import type { LatestSessionHomework } from '@gabby/types/sessionHomework';
import { markSessionHomeworkViewed } from '@/actions/sessionHomeworkAction';
import { SessionHomeworkContent } from '@/components/session/SessionHomeworkContent';
import { Drawer, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { formatSessionSlot } from '@/lib/sessionFormat';
import { cn } from '@/lib/utils';

/** まだ見ていない宿題か（一度も開いていない、または開いた後にコーチが追記した） */
function hasUnseenUpdate(homework: LatestSessionHomework): boolean {
  if (!homework.student_viewed_at) return true;
  const viewedAt = homework.student_viewed_at;
  return homework.comments.some((c) => c.insert_date > viewedAt);
}

interface LatestHomeworkBlockProps {
  homework: LatestSessionHomework;
  className?: string;
}

/**
 * ホームのライブセッションのカードの「前回の宿題」。本文の抜粋・添付と追記の件数を出し、
 * 「宿題を見る」でセッション結果画面へ行かずに全文・添付・追記をシートで読めるようにする（開いたら見たことを記録する）。
 * 自主トレーニングのメニューとは混ぜず、ライブセッションに付属するものとしてこのカードに置く。
 */
export function LatestHomeworkBlock({ homework, className }: LatestHomeworkBlockProps) {
  const timezone = useTimezone();
  const [isOpen, setIsOpen] = useState(false);
  const [isUnseen, setIsUnseen] = useState(() => hasUnseenUpdate(homework));
  const attachmentCount =
    homework.attachments.length + homework.comments.reduce((sum, c) => sum + c.attachments.length, 0);
  const sessionDate = formatSessionSlot(
    homework.session_start_datetime,
    homework.session_start_datetime,
    timezone,
  ).date;

  const handleOpen = () => {
    setIsOpen(true);
    if (!isUnseen) return;
    setIsUnseen(false);
    markSessionHomeworkViewed(homework.session_id).catch((err: unknown) => {
      clientLogger.warn('dashboard:mark_homework_viewed_failed', 'Failed to record homework view', { err });
    });
  };

  return (
    <section className={cn('flex flex-col rounded-control bg-canvas p-4', className)}>
      <div className="flex items-center gap-2">
        <h3 className="text-xs text-ink-muted">前回の宿題</h3>
        {isUnseen && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">新着</span>}
      </div>
      <p className="mt-2 truncate text-xs text-ink-muted">
        {sessionDate}のセッション{homework.coach_name ? `・${homework.coach_name}` : ''}
      </p>
      <p className="mt-1.5 line-clamp-3 text-sm text-ink whitespace-pre-wrap wrap-anywhere">{homework.homework_text}</p>
      {(attachmentCount > 0 || homework.comments.length > 0) && (
        <div className="mt-2 flex items-center gap-3 text-xs text-ink-muted">
          {attachmentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip size={13} />
              添付 {attachmentCount}
            </span>
          )}
          {homework.comments.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquareText size={13} />
              追記 {homework.comments.length}
            </span>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={handleOpen}
        className="mt-auto self-start pt-3 text-sm font-semibold text-brand-strong underline-offset-4 hover:underline"
      >
        宿題を見る
      </button>

      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerContent className="mx-auto max-h-[85vh] max-w-2xl">
          <DrawerHeader className="flex flex-row items-center justify-between gap-2 text-left">
            <DrawerTitle className="min-w-0 truncate text-base font-bold text-ink">
              {sessionDate}のセッションの宿題
            </DrawerTitle>
            <DrawerCloseButton />
          </DrawerHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-6">
            <SessionHomeworkContent homework={homework} />
            <Link
              href={`/live-room/sessions/${homework.session_id}/result`}
              className="inline-flex text-sm font-semibold text-brand-strong underline-offset-4 hover:underline"
            >
              セッションの結果を見る
            </Link>
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
