'use client';

import { createContext, useContext } from 'react';
import type { UserType } from '@gabby/types/user';
import type { ChatPreviewLabels } from '../../chat/formatChatPreview';
import type { ChatRoomTitleLabels } from '../../chat/roomDisplay';

/**
 * チャットUIの文言。共通部品には言語をハードコードせず、各アプリがこの形で注入する
 * （coach=英語 / student=日本語 / admin=next-intl の翻訳結果）。
 */
export interface ChatLabels extends ChatRoomTitleLabels {
  /** 日時表示のロケール（'ja-JP' / 'en-US'） */
  dateLocale: string;
  yesterday: string;
  userType: Record<UserType, string>;
  groupBadge: string;
  preview: ChatPreviewLabels;

  // ルーム一覧（左ペイン）
  listTitle: string;
  searchPlaceholder: string;
  clearSearch: string;
  filterAll: string;
  filterUnread: string;
  noRooms: string;
  noRoomsHint: string;
  noMatchingRooms: string;
  notMemberBadge: string;

  // 未選択時の右ペイン
  selectRoomTitle: string;
  selectRoomHint: string;
  /** 開けないルーム（存在しない・退出済み・参加していない）をリンク等で開いた場合 */
  roomUnavailableTitle: string;
  roomUnavailableHint: string;

  // タイムライン
  backToList: string;
  reviewModeBadge: string;
  viewOnlyNotice: string;
  unreadDivider: string;
  jumpToLatest: string;
  newMessages: (count: number) => string;
  /** 1対1ルームで、相手が読んだ自分の最新の発言の下に出す表示（「既読」等） */
  readReceipt: string;
  deletedMessage: string;
  attachmentFailed: string;
  deleteMessage: string;
  deleteMessageConfirmTitle: string;
  deleteMessageConfirmBody: string;
  deleteMessageFailed: string;

  // 入力欄
  composerPlaceholder: string;
  attachFile: string;
  sendMessage: string;
  removeAttachment: string;
  sendFailed: string;
  fileTooLarge: (fileName: string) => string;
  uploadFailed: (fileName: string) => string;
}

/**
 * 2ペイン表示に切り替える画面幅。これ未満では一覧とルームを1画面ずつ切り替える。
 * 各アプリの定数で指定し、変更はその1か所で済むようにする（例: student は lg → md に変えるとタブレットでも2ペイン）。
 */
export type ChatSplitBreakpoint = 'md' | 'lg';

interface ChatUiContextValue {
  labels: ChatLabels;
  /** チャット画面のルートパス（一覧）。ルームは `${basePath}/${roomId}` */
  basePath: string;
  breakpoint: ChatSplitBreakpoint;
}

const ChatUiContext = createContext<ChatUiContextValue | null>(null);

export function ChatUiProvider({ children, ...value }: ChatUiContextValue & { children: React.ReactNode }) {
  return <ChatUiContext.Provider value={value}>{children}</ChatUiContext.Provider>;
}

export function useChatUi(): ChatUiContextValue {
  const ctx = useContext(ChatUiContext);
  if (!ctx) throw new Error('useChatUi must be used within ChatUiProvider');
  return ctx;
}

/**
 * 2ペインの出し分けクラス（Tailwind はクラス名を静的に検出するため、組み立てずに全て列挙する）。
 * - list / pane: 狭い画面では選択状態に応じてどちらか一方だけを表示し、広い画面では両方を表示する
 * - backButton: ルームから一覧へ戻るボタン（2ペイン時は不要なので隠す）
 */
export const CHAT_SPLIT_CLASSES: Record<
  ChatSplitBreakpoint,
  { listShown: string; listHidden: string; paneShown: string; paneHidden: string; backButton: string }
> = {
  md: {
    listShown: 'flex md:w-80 md:border-r lg:w-88',
    listHidden: 'hidden md:flex md:w-80 md:border-r lg:w-88',
    paneShown: 'flex',
    paneHidden: 'hidden md:flex',
    backButton: 'md:hidden',
  },
  lg: {
    listShown: 'flex lg:w-88 lg:border-r',
    listHidden: 'hidden lg:flex lg:w-88 lg:border-r',
    paneShown: 'flex',
    paneHidden: 'hidden lg:flex',
    backButton: 'lg:hidden',
  },
};

/** 見出しの日時表示（「14:05」「昨日」「9/12」等）の文言 */
export function getHeaderTimeLabels(labels: ChatLabels, timeZone: string) {
  return { locale: labels.dateLocale, yesterdayLabel: labels.yesterday, timeZone };
}
