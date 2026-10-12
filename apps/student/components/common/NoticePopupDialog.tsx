'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronDown, ChevronRight, Info, Megaphone, Sparkles, Wrench, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerCloseButton, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { NoticeMarkdown } from '@/components/common/NoticeMarkdown';
import { NoticeAttachmentList } from '@/components/common/NoticeAttachmentList';
import { useNoticeStore } from '@gabby/lib/stores/useNoticeStore';
import { useMediaQuery } from '@gabby/lib/hooks/useMediaQuery';
import { useSmartClamp } from '@gabby/lib/hooks/useSmartClamp';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import { formatZonedDateJapanese } from '@gabby/lib/date/date';
import { toNoticePlainText } from '@gabby/lib/notice/plainText';
import { clientLogger } from '@gabby/lib/logger/client';
import { NOTICE_TYPES, NOTICE_IMPORTANT_BADGE, type NoticeItem, type NoticeType } from '@gabby/types/notice';

const NOTICE_TYPE_ICONS: Record<NoticeType, LucideIcon> = {
  INFO: Info,
  CAMPAIGN: Megaphone,
  MAINTENANCE: Wrench,
  UPDATE: Sparkles,
};

/** ボトムシートをやめて中央のダイアログにする画面幅（Tailwind の sm） */
const DESKTOP_QUERY = '(min-width: 640px)';

interface NoticePopupDialogProps {
  notice: NoticeItem;
  /** ほかに未読のポップアップ対象が何件あるか。1件以上なら一覧への案内を出す */
  moreCount?: number;
  onClose: () => void;
}

/**
 * お知らせのポップアップ（1件ずつ）。
 * スマホはボトムシート、sm 以上は中央の小さなダイアログで出す。本文は先頭の数行だけを見せ、
 * 「続きを読む」でその場に全文と添付ファイルを広げる。
 * 表示したお知らせは閉じ方（確認・×・枠外・一覧へ移動）によらず既読にする。
 */
export function NoticePopupDialog({ notice, moreCount = 0, onClose }: NoticePopupDialogProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const markAsRead = useNoticeStore((s) => s.markAsRead);

  const close = () => {
    onClose();
    if (!notice.is_read) {
      markAsRead(notice.notice_id).catch((err: unknown) => {
        clientLogger.error('notice:mark_read_failed', 'Failed to mark notice as read', { err });
      });
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) close();
  };

  if (isDesktop) {
    return (
      <DialogPrimitive.Root open onOpenChange={handleOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-4rem)] w-[calc(100vw-2rem)] max-w-120 -translate-x-1/2 -translate-y-1/2 flex-col rounded-panel bg-surface p-6 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          >
            <NoticePopupBody
              notice={notice}
              moreCount={moreCount}
              onClose={close}
              title={<DialogPrimitive.Title className={TITLE_CLASS}>{notice.title}</DialogPrimitive.Title>}
              closeButton={
                <DialogPrimitive.Close
                  aria-label="閉じる"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-subtle transition-colors hover:bg-line/60 hover:text-ink-soft"
                >
                  <X size={18} />
                </DialogPrimitive.Close>
              }
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <Drawer open onOpenChange={handleOpenChange} shouldScaleBackground={false}>
      <DrawerContent
        aria-describedby={undefined}
        overlayClassName="bg-ink/30"
        className="mx-auto max-h-[calc(100dvh-2.75rem)] max-w-2xl rounded-t-panel border-none bg-surface px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-1"
      >
        <NoticePopupBody
          notice={notice}
          moreCount={moreCount}
          onClose={close}
          title={<DrawerTitle className={TITLE_CLASS}>{notice.title}</DrawerTitle>}
          closeButton={<DrawerCloseButton />}
        />
      </DrawerContent>
    </Drawer>
  );
}

const TITLE_CLASS = 'text-lg font-bold leading-snug tracking-normal text-ink sm:text-xl';

interface NoticePopupBodyProps {
  notice: NoticeItem;
  moreCount: number;
  onClose: () => void;
  /** 読み上げの見出しにもなる件名（シート・ダイアログそれぞれの Title 部品で包んで渡す） */
  title: ReactNode;
  closeButton: ReactNode;
}

function NoticePopupBody({ notice, moreCount, onClose, title, closeButton }: NoticePopupBodyProps) {
  const timezone = useTimezone();
  const { ref: summaryRef, isTruncated, isExpanded, setExpanded } = useSmartClamp<HTMLParagraphElement>();

  const summary = toNoticePlainText(notice.content);
  const hasAttachments = notice.attachments.length > 0;
  // 要約で省略された・Markdown の見た目（見出し・箇条書き等）が落ちた・添付がある場合は全文を見られるようにする
  const canExpand = isTruncated || hasAttachments || summary !== notice.content.trim();

  const TypeIcon = NOTICE_TYPE_ICONS[notice.notice_type] ?? Info;
  const typeLabel = NOTICE_TYPES[notice.notice_type]?.label ?? notice.notice_type;

  return (
    <>
      {/* 種別・日付・件名 */}
      <div className={cn('flex shrink-0 flex-col gap-3 pt-3 sm:pt-0', isExpanded && 'border-b border-line pb-3')}>
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand">
            <TypeIcon size={20} aria-hidden />
          </span>
          <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-ink-muted">
            <span>
              {typeLabel}・{formatZonedDateJapanese(notice.published_at, timezone)}
            </span>
            {notice.is_important && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                {NOTICE_IMPORTANT_BADGE.label}
              </span>
            )}
          </p>
          {closeButton}
        </div>
        {title}
      </div>

      {/* 本文: 先頭の数行 → 「続きを読む」で全文と添付 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3">
        {isExpanded ? (
          <div className="space-y-5">
            <NoticeMarkdown content={notice.content} />
            <NoticeAttachmentList attachments={notice.attachments} />
          </div>
        ) : (
          <>
            <p ref={summaryRef} className="line-clamp-3 text-sm leading-relaxed text-ink-soft">
              {summary}
            </p>
            {canExpand && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="mt-1 flex h-9 items-center gap-1 text-[13px] font-bold text-brand hover:text-brand-strong"
              >
                続きを読む
                <ChevronDown size={16} aria-hidden />
              </button>
            )}
          </>
        )}
      </div>

      {/* 操作 */}
      <div
        className={cn(
          'flex shrink-0 flex-col gap-1 pt-2 sm:flex-row-reverse sm:items-center sm:justify-between sm:gap-3',
          isExpanded && 'border-t border-line pt-3'
        )}
      >
        <Button
          type="button"
          onClick={onClose}
          className="h-12 w-full rounded-control bg-brand text-[15px] font-bold text-white shadow-none hover:bg-brand-strong sm:h-11 sm:w-auto sm:px-6 sm:text-sm"
        >
          確認しました
        </Button>
        {moreCount > 0 && (
          <Link
            href="/notice"
            onClick={onClose}
            className="flex h-11 items-center justify-center gap-1 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink-soft"
          >
            ほかに新しいお知らせが{moreCount}件あります
            <ChevronRight size={16} aria-hidden />
          </Link>
        )}
      </div>
    </>
  );
}
