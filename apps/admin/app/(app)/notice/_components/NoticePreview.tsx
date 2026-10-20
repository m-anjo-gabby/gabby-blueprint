'use client';

import { Monitor, Smartphone, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { NoticeDetail } from '@gabby/lib/components/notice/NoticeDetail';
import { NoticeHomeCard } from '@gabby/lib/components/notice/NoticeHomeCard';
import { NoticeMeta } from '@gabby/lib/components/notice/NoticeMeta';
import {
  NOTICE_POPUP_CLASSES,
  NoticePopupContent,
  noticePopupTitleClass,
  type NoticePopupVariant,
} from '@gabby/lib/components/notice/NoticePopup';
import { NOTICE_LABELS_EN, NOTICE_LABELS_JA, type NoticeLabels } from '@gabby/lib/notice/labels';
import type {
  NoticeAttachment,
  NoticeDisplayMode,
  NoticeItem,
  NoticeTargetType,
  NoticeType,
} from '@gabby/types/notice';
import { cn } from '@/lib/utils';

/** プレビューに渡す編集中の内容（保存前の値） */
export interface NoticePreviewDraft {
  targetType: NoticeTargetType;
  noticeType: NoticeType;
  isImportant: boolean;
  displayMode: NoticeDisplayMode;
  title: string;
  content: string;
  /** 公開開始日（JST の YYYY-MM-DD） */
  publishedAtJst: string;
  attachments: Pick<NoticeAttachment, 'id' | 'name' | 'size' | 'mime_type'>[];
  /** 見出し画像（保存済みの公開URL、または選択中のファイルのプレビューURL） */
  imageUrl: string | null;
  ctaLabel: string;
  ctaUrl: string;
}

type Device = 'mobile' | 'desktop';

/**
 * お知らせのプレビュー。生徒・コーチのアプリと同じ共通部品（packages/lib/components/notice）で、
 * 表示方法ごとの実際の見た目（ポップアップ／ホームのカード／一覧で開いた中身）をスマホ・PCの枠に描く。
 * リンク・行動ボタン・添付ファイルは押しても動かない。コーチ向けはコーチアプリの文言（英語）で描く。
 */
export function NoticePreview({ draft }: { draft: NoticePreviewDraft }) {
  const t = useTranslations('notice.editor');
  const [device, setDevice] = React.useState<Device>('mobile');
  // ホームのカードの「詳しく見る」で開くポップアップ
  const [homeDetailOpen, setHomeDetailOpen] = React.useState(false);
  // 閉じた後にもう一度出すため、ポップアップを作り直す（「続きを読む」も戻る）
  const [popupKey, setPopupKey] = React.useState(0);

  const isCoach = draft.targetType === 'COACH';
  const labels = isCoach ? NOTICE_LABELS_EN : NOTICE_LABELS_JA;
  const notice = toPreviewNotice(draft, t('previewNoTitle'));
  const variant: NoticePopupVariant = device === 'mobile' ? 'sheet' : 'dialog';

  const reopenPopup = () => {
    setHomeDetailOpen(false);
    setPopupKey((k) => k + 1);
  };

  const popup = (
    <PreviewPopup
      key={popupKey}
      variant={variant}
      // 自動で出るポップアップは一覧への案内も確かめられるよう「ほかに1件ある」状態で描く（ホームのカードから開いた場合は出ない）
      moreCount={draft.displayMode === 'POPUP' ? 1 : 0}
      notice={notice}
      imageUrl={draft.imageUrl}
      labels={labels}
      onClose={reopenPopup}
    />
  );

  const caption =
    draft.displayMode === 'POPUP'
      ? t('previewCaptionPopup')
      : draft.displayMode === 'HOME'
        ? t('previewCaptionHome')
        : t('previewCaptionList');

  return (
    <div className="flex h-full flex-col gap-4 bg-slate-50/50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-xs font-black text-slate-800">{caption}</p>
          <p className="text-[10px] text-slate-500">{isCoach ? t('previewCoachNote') : t('previewStudentNote')}</p>
        </div>
        <div
          className="flex items-center gap-1 rounded-xl border bg-white p-1 shadow-sm"
          role="radiogroup"
          aria-label={t('previewDeviceLabel')}
        >
          {(['mobile', 'desktop'] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={device === d}
              onClick={() => setDevice(d)}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold transition-colors',
                device === d ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {d === 'mobile' ? <Smartphone size={13} /> : <Monitor size={13} />}
              {d === 'mobile' ? t('previewMobile') : t('previewDesktop')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-stretch justify-center overflow-auto">
        <DeviceFrame device={device}>
          {draft.displayMode === 'LIST' ? (
            <div className={cn('h-full overflow-y-auto', device === 'mobile' ? 'p-4' : 'p-8')}>
              <article className="rounded-card border border-line bg-surface p-5 shadow-xs">
                <div className="space-y-2 border-b border-line pb-4">
                  <NoticeMeta notice={notice} labels={labels} size="sm" />
                  <h2 className="text-sm font-bold leading-snug text-ink wrap-anywhere">{notice.title}</h2>
                </div>
                <div className="pt-4">
                  <NoticeDetail notice={notice} labels={labels} imageUrl={draft.imageUrl} preview />
                </div>
              </article>
            </div>
          ) : draft.displayMode === 'HOME' ? (
            <>
              <div className={cn('h-full space-y-4 overflow-y-auto', device === 'mobile' ? 'p-4' : 'p-8')}>
                <HomePlaceholderHeader />
                <NoticeHomeCard
                  notice={notice}
                  labels={labels}
                  moreCount={0}
                  imageUrl={draft.imageUrl}
                  onDismiss={() => undefined}
                  onOpenDetail={() => setHomeDetailOpen(true)}
                  preview
                />
                <HomePlaceholderCards device={device} />
              </div>
              {homeDetailOpen && popup}
            </>
          ) : (
            <>
              <div className={cn('h-full space-y-4', device === 'mobile' ? 'p-4' : 'p-8')}>
                <HomePlaceholderHeader />
                <HomePlaceholderCards device={device} />
              </div>
              {popup}
            </>
          )}
        </DeviceFrame>
      </div>
      <p className="text-[10px] text-slate-400">{t('previewNote')}</p>
    </div>
  );
}

/** 編集中の内容を、共通部品に渡すお知らせの形にする */
function toPreviewNotice(draft: NoticePreviewDraft, noTitle: string): NoticeItem {
  const now = new Date().toISOString();
  const ctaLabel = draft.ctaLabel.trim();
  const ctaUrl = draft.ctaUrl.trim();
  // コーチ向けは行動ボタンを使わない（保存時と同じ扱い）
  const hasCta = draft.targetType !== 'COACH' && Boolean(ctaLabel && ctaUrl);
  return {
    notice_id: 'preview',
    target_type: draft.targetType,
    client_id: null,
    notice_type: draft.noticeType,
    is_important: draft.isImportant,
    display_mode: draft.displayMode,
    title: draft.title.trim() || noTitle,
    content: draft.content,
    // 未保存のファイルは Storage のパスが無い（プレビューでは表示・保存を押せない）
    attachments: draft.attachments.map((a) => ({ ...a, path: '' })),
    image_path: null,
    cta_label: hasCta ? ctaLabel : null,
    cta_url: hasCta ? ctaUrl : null,
    published_at: draft.publishedAtJst ? new Date(`${draft.publishedAtJst}T00:00:00+09:00`).toISOString() : now,
    expired_at: null,
    is_published: true,
    insert_date: now,
    update_date: now,
    is_read: false,
  };
}

/** スマホ（幅375・高さは最大720）・PC（幅いっぱい・高さは最大600）の枠。高さはプレビュー欄に収める（ボタンまで見えるように）。ポップアップは枠の中に重ねて描く */
function DeviceFrame({ device, children }: { device: Device; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden bg-canvas font-sans text-ink',
        device === 'mobile'
          ? 'max-h-[720px] min-h-[480px] w-[375px] rounded-[2.5rem] border-[10px] border-slate-800 shadow-xl'
          : 'max-h-[600px] min-h-[420px] w-full max-w-[960px] rounded-xl border border-slate-200 shadow-sm',
      )}
    >
      {children}
    </div>
  );
}

function PreviewPopup({
  variant,
  moreCount,
  notice,
  imageUrl,
  labels,
  onClose,
}: {
  variant: NoticePopupVariant;
  moreCount: number;
  notice: NoticeItem;
  imageUrl: string | null;
  labels: NoticeLabels;
  onClose: () => void;
}) {
  const content = (
    <NoticePopupContent
      variant={variant}
      notice={notice}
      labels={labels}
      moreCount={moreCount}
      imageUrl={imageUrl}
      onAcknowledge={onClose}
      onCtaClick={onClose}
      preview
      title={<h2 className={noticePopupTitleClass(variant)}>{notice.title}</h2>}
      closeButton={
        <button type="button" aria-label={labels.close} onClick={onClose} className={NOTICE_POPUP_CLASSES.closeButton}>
          <X size={18} />
        </button>
      }
    />
  );

  return (
    <>
      <div className={cn('absolute inset-0', NOTICE_POPUP_CLASSES.overlay)} aria-hidden />
      {variant === 'sheet' ? (
        <div className={cn('absolute inset-x-0 bottom-0 max-h-[calc(100%-2.75rem)]', NOTICE_POPUP_CLASSES.sheet)}>
          <div className={NOTICE_POPUP_CLASSES.sheetHandle} aria-hidden />
          {content}
        </div>
      ) : (
        <div
          className={cn(
            'absolute left-1/2 top-1/2 max-h-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2',
            NOTICE_POPUP_CLASSES.dialog,
            'w-[calc(100%-2rem)]',
          )}
        >
          {content}
        </div>
      )}
    </>
  );
}

/** プレビューの背景（ホームのあいさつの代わり） */
function HomePlaceholderHeader() {
  return (
    <div className="space-y-2 px-1" aria-hidden>
      <div className="h-3 w-24 rounded-full bg-skeleton" />
      <div className="h-5 w-44 rounded-full bg-skeleton" />
    </div>
  );
}

/** プレビューの背景（ホームのカードの代わり） */
function HomePlaceholderCards({ device }: { device: Device }) {
  return (
    <div className={cn('grid gap-4', device === 'desktop' && 'grid-cols-3')} aria-hidden>
      <div className={cn('h-40 rounded-card bg-brand/80', device === 'desktop' && 'col-span-2')} />
      <div className="h-40 rounded-card border border-line bg-surface" />
      <div className={cn('h-28 rounded-card border border-line bg-surface', device === 'desktop' && 'col-span-3')} />
    </div>
  );
}
