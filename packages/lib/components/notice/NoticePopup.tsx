'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { Drawer } from 'vaul';
import type { NoticeItem } from '@gabby/types/notice';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useSmartClamp } from '../../hooks/useSmartClamp';
import { clientLogger } from '../../logger/client';
import type { NoticeLabels } from '../../notice/labels';
import { getNoticeImageUrl } from '../../notice/links';
import { toNoticePlainText } from '../../notice/plainText';
import { useNoticeStore } from '../../stores/useNoticeStore';
import { cn } from '../../utils';
import { focusDialogContent } from '../common/dialogFocus';
import { hasNoticeCta, NoticeCtaLink, NoticeImage } from './NoticeCta';
import { NoticeDetail } from './NoticeDetail';
import { NoticeMeta } from './NoticeMeta';

/** ボトムシートをやめて中央のダイアログにする画面幅（Tailwind の sm） */
const DESKTOP_QUERY = '(min-width: 640px)';

/**
 * ポップアップの外形（位置は使う側で指定する）。実際のポップアップとアドミンのプレビューの枠で共有し、見た目をそろえる。
 */
export const NOTICE_POPUP_CLASSES = {
  overlay: 'bg-ink/30',
  /** スマホ: 画面下から出るシート */
  sheet:
    'mx-auto flex max-w-2xl flex-col rounded-t-panel bg-surface px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-1 shadow-2xl outline-none',
  sheetHandle: 'mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-line',
  /** sm 以上: 中央の小さなダイアログ */
  dialog: 'flex w-[calc(100vw-2rem)] max-w-120 flex-col rounded-panel bg-surface p-6 shadow-2xl outline-none',
  closeButton:
    'flex size-9 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-subtle transition-colors hover:bg-line/60 hover:text-ink-soft',
} as const;

/**
 * ポップアップの出し方。画面幅ではなくこの値で中身の配置を決める
 * （アドミンのプレビューでは、PCの画面の中にスマホの枠を描くため、画面幅で切り替えると実物と違って見える）。
 */
export type NoticePopupVariant = 'sheet' | 'dialog';

/** 件名の文字の大きさ（シート・ダイアログそれぞれの Title 部品に付ける） */
export function noticePopupTitleClass(variant: NoticePopupVariant): string {
  return cn(
    'font-bold leading-snug tracking-normal text-ink wrap-anywhere',
    variant === 'sheet' ? 'text-lg' : 'text-xl',
  );
}

interface NoticePopupProps {
  notice: NoticeItem;
  labels: NoticeLabels;
  /** ほかに未読のポップアップ対象が何件あるか。1件以上なら一覧への案内を出す */
  moreCount?: number;
  onClose: () => void;
}

/**
 * お知らせのポップアップ（1件ずつ。生徒・コーチで共通）。
 * スマホはボトムシート、sm 以上は中央の小さなダイアログで出す。本文は先頭の数行だけを見せ、
 * 「続きを読む」でその場に全文と添付ファイルを広げる。見出し画像・行動ボタンがあれば出す。
 * 表示したお知らせは閉じ方（確認・×・枠外・一覧へ移動・行動ボタン）によらず既読にする。
 */
export function NoticePopup({ notice, labels, moreCount = 0, onClose }: NoticePopupProps) {
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
          <DialogPrimitive.Overlay
            className={cn(
              'fixed inset-0 z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0',
              NOTICE_POPUP_CLASSES.overlay,
            )}
          />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onOpenAutoFocus={focusDialogContent}
            className={cn(
              'fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-4rem)] -translate-x-1/2 -translate-y-1/2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
              NOTICE_POPUP_CLASSES.dialog,
            )}
          >
            <NoticePopupContent
              variant="dialog"
              notice={notice}
              labels={labels}
              moreCount={moreCount}
              onAcknowledge={close}
              // 行動ボタンは押した記録が既読も兼ねるため、閉じるだけ
              onCtaClick={onClose}
              title={
                <DialogPrimitive.Title className={noticePopupTitleClass('dialog')}>
                  {notice.title}
                </DialogPrimitive.Title>
              }
              closeButton={
                <DialogPrimitive.Close aria-label={labels.close} className={NOTICE_POPUP_CLASSES.closeButton}>
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
    <Drawer.Root open onOpenChange={handleOpenChange} shouldScaleBackground={false}>
      <Drawer.Portal>
        <Drawer.Overlay className={cn('fixed inset-0 z-50', NOTICE_POPUP_CLASSES.overlay)} />
        <Drawer.Content
          aria-describedby={undefined}
          onOpenAutoFocus={focusDialogContent}
          className={cn('fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-2.75rem)]', NOTICE_POPUP_CLASSES.sheet)}
        >
          <div className={NOTICE_POPUP_CLASSES.sheetHandle} aria-hidden />
          <NoticePopupContent
            variant="sheet"
            notice={notice}
            labels={labels}
            moreCount={moreCount}
            onAcknowledge={close}
            onCtaClick={onClose}
            title={<Drawer.Title className={noticePopupTitleClass('sheet')}>{notice.title}</Drawer.Title>}
            closeButton={
              <Drawer.Close aria-label={labels.close} data-vaul-no-drag className={NOTICE_POPUP_CLASSES.closeButton}>
                <X size={18} />
              </Drawer.Close>
            }
          />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export interface NoticePopupContentProps {
  variant: NoticePopupVariant;
  notice: NoticeItem;
  labels: NoticeLabels;
  moreCount: number;
  /** 「確認しました」 */
  onAcknowledge: () => void;
  /** 行動ボタンを押した時 */
  onCtaClick: () => void;
  /** 読み上げの見出しにもなる件名（シート・ダイアログそれぞれの Title 部品で包んで渡す） */
  title: ReactNode;
  closeButton: ReactNode;
  /** 見出し画像のURL（アドミンのプレビューで未保存の画像を出す場合に指定。省略時は image_path から組み立てる） */
  imageUrl?: string | null;
  /** アドミンのプレビュー（リンク・行動ボタン・添付ファイルを押しても移動・記録しない） */
  preview?: boolean;
}

/** ポップアップの中身（シート・ダイアログ・アドミンのプレビューで共通） */
export function NoticePopupContent({
  variant,
  notice,
  labels,
  moreCount,
  onAcknowledge,
  onCtaClick,
  title,
  closeButton,
  imageUrl,
  preview = false,
}: NoticePopupContentProps) {
  const [isExpanded, setExpanded] = useState(false);
  const hasCta = hasNoticeCta(notice);
  const isSheet = variant === 'sheet';
  const src = imageUrl !== undefined ? imageUrl : getNoticeImageUrl(notice.image_path);
  const handleMoreClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (preview) event.preventDefault();
    else onAcknowledge();
  };

  return (
    <>
      {/* 種別・日付・件名 */}
      <div className={cn('flex shrink-0 flex-col gap-3', isSheet && 'pt-3', isExpanded && 'border-b border-line pb-3')}>
        <div className="flex items-center gap-3">
          <NoticeMeta notice={notice} labels={labels} />
          {closeButton}
        </div>
        {title}
      </div>

      {/* 本文: 見出し画像・先頭の数行 → 「続きを読む」で全文と添付 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3">
        <NoticeImage src={src} className="mb-3" />
        {isExpanded ? (
          <NoticeDetail notice={notice} labels={labels} preview={preview} includeImageAndCta={false} />
        ) : (
          // 本文が変わったら省略の判定をやり直す（アドミンのプレビューで入力中に変わる）
          <NoticeSummary key={notice.content} notice={notice} labels={labels} onExpand={() => setExpanded(true)} />
        )}
      </div>

      {/* 操作（ダイアログはボタンを右寄せの1行にし、「ほかに新しいお知らせ」は下の行の左に置く） */}
      <div className={cn('flex shrink-0 flex-col gap-1 pt-2', isExpanded && 'border-t border-line pt-3')}>
        {hasCta ? (
          // 行動ボタンがある場合はそちらを主にし、「確認しました」は控えめに並べる
          <div className={cn('flex', isSheet ? 'flex-col gap-1' : 'flex-row-reverse flex-wrap items-center gap-2')}>
            <NoticeCtaLink
              notice={notice}
              labels={labels}
              onClick={onCtaClick}
              preview={preview}
              className={isSheet ? 'h-12 w-full text-[15px]' : 'h-11 whitespace-nowrap text-sm'}
            />
            <button
              type="button"
              onClick={onAcknowledge}
              className="h-11 whitespace-nowrap rounded-control px-4 text-sm font-bold text-ink-muted transition-colors hover:bg-canvas hover:text-ink-soft"
            >
              {labels.acknowledge}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAcknowledge}
            className={cn(
              'rounded-control bg-brand font-bold text-white transition-colors hover:bg-brand-strong',
              isSheet ? 'h-12 w-full text-[15px]' : 'h-11 self-end whitespace-nowrap px-6 text-sm',
            )}
          >
            {labels.acknowledge}
          </button>
        )}
        {moreCount > 0 && (
          <Link
            href="/notice"
            onClick={handleMoreClick}
            className={cn(
              'flex items-center gap-1 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink-soft',
              isSheet ? 'h-11 justify-center' : 'h-9 self-start',
            )}
          >
            {labels.moreNotices(moreCount)}
            <ChevronRight size={16} aria-hidden />
          </Link>
        )}
      </div>
    </>
  );
}

/** 本文の先頭3行（Markdown の記号を外した文章）と「続きを読む」 */
function NoticeSummary({
  notice,
  labels,
  onExpand,
}: {
  notice: NoticeItem;
  labels: NoticeLabels;
  onExpand: () => void;
}) {
  const { ref, isTruncated } = useSmartClamp<HTMLParagraphElement>();
  const summary = toNoticePlainText(notice.content);
  // 要約で省略された・Markdown の見た目（見出し・箇条書き等）が落ちた・添付がある場合は全文を見られるようにする
  const canExpand = isTruncated || notice.attachments.length > 0 || summary !== notice.content.trim();

  return (
    <>
      <p ref={ref} className="line-clamp-3 text-sm leading-relaxed text-ink-soft">
        {summary}
      </p>
      {canExpand && (
        <button
          type="button"
          onClick={onExpand}
          className="mt-1 flex h-9 items-center gap-1 text-[13px] font-bold text-brand hover:text-brand-strong"
        >
          {labels.readMore}
          <ChevronDown size={16} aria-hidden />
        </button>
      )}
    </>
  );
}
