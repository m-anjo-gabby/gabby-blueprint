import type { NoticeType } from '@gabby/types/notice';
import { formatZonedDateJapanese } from '../date/date';
import { formatDateEn } from '../date/dateEn';

/**
 * お知らせの表示（packages/lib/components/notice）に渡す文言。
 * 共通部品には文言を書かず、アプリの言語に合わせてこのどちらかを渡す。
 * アドミンのプレビューで利用者と同じ文言を出すため、生徒（日本語）・コーチ（英語）の文言をここに置く。
 */
export interface NoticeLabels {
  types: Record<NoticeType, string>;
  important: string;
  /** 種別と公開日の区切り */
  metaSeparator: string;
  /** 公開日の表示 */
  formatDate: (iso: string, timezone: string) => string;
  /** ポップアップの×（読み上げ用） */
  close: string;
  acknowledge: string;
  readMore: string;
  /** ポップアップの「ほかに新しいお知らせ」（お知らせ一覧へ） */
  moreNotices: (count: number) => string;
  /** 外部ページの行動ボタンに添える読み上げ用の補足 */
  opensInNewTab: string;
  attachments: { title: string; preview: string; previewHint: string; save: string; saveHint: string };
  homeCard: { region: string; dismiss: string; detail: string; moreNotices: (count: number) => string };
}

/** 生徒アプリ（日本語） */
export const NOTICE_LABELS_JA: NoticeLabels = {
  types: { INFO: 'お知らせ', CAMPAIGN: 'キャンペーン', MAINTENANCE: 'メンテナンス', UPDATE: 'アップデート' },
  important: '重要',
  metaSeparator: '・',
  formatDate: formatZonedDateJapanese,
  close: '閉じる',
  acknowledge: '確認しました',
  readMore: '続きを読む',
  moreNotices: (count) => `ほかに新しいお知らせが${count}件あります`,
  opensInNewTab: '（別のタブで開きます）',
  attachments: {
    title: '添付ファイル',
    preview: '表示',
    previewHint: '別タブで表示',
    save: '保存',
    saveHint: '端末に保存',
  },
  homeCard: {
    region: 'お知らせ',
    dismiss: 'このお知らせを閉じる',
    detail: '詳しく見る',
    moreNotices: (count) => `ほかに${count}件のお知らせ`,
  },
};

/** コーチアプリ（英語） */
export const NOTICE_LABELS_EN: NoticeLabels = {
  types: { INFO: 'Notice', CAMPAIGN: 'Campaign', MAINTENANCE: 'Maintenance', UPDATE: 'Update' },
  important: 'Important',
  metaSeparator: ' · ',
  formatDate: formatDateEn,
  close: 'Close',
  acknowledge: 'Got it',
  readMore: 'Read more',
  moreNotices: (count) => `${count} more new ${count === 1 ? 'notice' : 'notices'}`,
  opensInNewTab: '(opens in a new tab)',
  attachments: {
    title: 'Attachments',
    preview: 'Preview',
    previewHint: 'Open in a new tab',
    save: 'Save',
    saveHint: 'Download',
  },
  homeCard: {
    region: 'Notice',
    dismiss: 'Dismiss this notice',
    detail: 'Read more',
    moreNotices: (count) => `${count} more ${count === 1 ? 'notice' : 'notices'}`,
  },
};
