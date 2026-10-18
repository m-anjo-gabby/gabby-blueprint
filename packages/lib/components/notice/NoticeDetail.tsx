'use client';

import type { NoticeItem } from '@gabby/types/notice';
import { getNoticeImageUrl } from '../../notice/links';
import type { NoticeLabels } from '../../notice/labels';
import { NoticeMarkdown } from './NoticeMarkdown';
import { NoticeAttachmentList } from './NoticeAttachmentList';
import { NoticeCtaLink, NoticeImage } from './NoticeCta';

export interface NoticeDetailProps {
  notice: NoticeItem;
  labels: NoticeLabels;
  /** 見出し画像のURL（アドミンのプレビューで未保存の画像を出す場合に指定。省略時は image_path から組み立てる） */
  imageUrl?: string | null;
  /** 行動ボタンを押した直後に呼ぶ */
  onCtaClick?: () => void;
  /** アドミンのプレビュー（行動ボタン・添付ファイルを押しても何もしない） */
  preview?: boolean;
  /** 見出し画像と行動ボタンを含めるか（ポップアップは画像を本文の上、ボタンを下部に別に出すため false） */
  includeImageAndCta?: boolean;
}

/**
 * お知らせの全文（見出し画像・本文・行動ボタン・添付ファイル）。
 * お知らせ一覧のカードを開いた中身と、ポップアップの「続きを読む」で共通。
 */
export function NoticeDetail({
  notice,
  labels,
  imageUrl,
  onCtaClick,
  preview = false,
  includeImageAndCta = true,
}: NoticeDetailProps) {
  const src = imageUrl !== undefined ? imageUrl : getNoticeImageUrl(notice.image_path);
  return (
    // 行動ボタンの幅は画面幅ではなく置かれた枠の幅で決める（アドミンのプレビューのスマホ枠でも実物と同じに見えるように）
    <div className="@container space-y-5">
      {includeImageAndCta && <NoticeImage src={src} />}
      <NoticeMarkdown content={notice.content} />
      {includeImageAndCta && (
        <NoticeCtaLink
          notice={notice}
          labels={labels}
          onClick={onCtaClick}
          preview={preview}
          className="h-11 w-full @md:w-auto"
        />
      )}
      <NoticeAttachmentList attachments={notice.attachments} labels={labels.attachments} preview={preview} />
    </div>
  );
}
