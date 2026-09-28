import type { ChatLabels, ChatSplitBreakpoint } from '@gabby/lib/components/chat/ChatUiContext';
import { USER_TYPES } from '@gabby/types/user';

/**
 * 2ペイン（ルーム一覧＋ルーム）で表示する画面幅。
 * lg: PC のみ2ペイン（タブレットは一覧→ルームの切り替え）。タブレットでも2ペインにする場合は 'md' に変える。
 */
export const CHAT_SPLIT_BREAKPOINT: ChatSplitBreakpoint = 'lg';

export const CHAT_LABELS: ChatLabels = {
  dateLocale: 'ja-JP',
  yesterday: '昨日',
  userType: {
    [USER_TYPES.ADMIN]: '運営',
    [USER_TYPES.STUDENT]: '生徒',
    [USER_TYPES.COACH]: 'コーチ',
  },
  unnamedUser: '不明なユーザー',
  unnamedGroup: 'グループ',
  groupBadge: 'グループ',
  preview: {
    deleted: 'このメッセージは削除されました',
    photo: '📷 写真',
    file: '📎 ファイル',
    noMessages: 'まだメッセージはありません',
  },

  listTitle: 'チャット',
  searchPlaceholder: '名前・メッセージを検索',
  clearSearch: '検索をクリア',
  filterAll: 'すべて',
  filterUnread: '未読',
  noRooms: 'チャットルームはありません',
  noRoomsHint: '担当コーチや運営とのチャットが開始されると、ここに表示されます。',
  noMatchingRooms: '該当するチャットはありません',
  notMemberBadge: '非参加',

  selectRoomTitle: 'チャットを選択してください',
  selectRoomHint: '左の一覧から、担当コーチや運営とのチャットを開けます。',
  roomUnavailableTitle: 'このチャットは表示できません',
  roomUnavailableHint: 'チャットが終了したか、参加者から外れた可能性があります。一覧から開き直してください。',

  backToList: 'チャット一覧に戻る',
  reviewModeBadge: '閲覧のみ',
  viewOnlyNotice: 'このルームの参加者ではないため、メッセージを送信できません。',
  unreadDivider: 'ここから未読',
  jumpToLatest: '最新のメッセージへ',
  newMessages: (count) => `新着メッセージ ${count}件`,
  readReceipt: '既読',
  deletedMessage: 'このメッセージは削除されました',
  attachmentFailed: '添付ファイルの読み込みに失敗しました',
  openImage: '画像を拡大表示',
  openOriginalImage: '元の画像を開く',
  closeImage: '閉じる',
  deleteMessage: '削除',
  deleteMessageConfirmTitle: 'メッセージの削除',
  deleteMessageConfirmBody: 'このメッセージを削除します。元に戻せません。よろしいですか？',
  deleteMessageFailed: 'メッセージの削除に失敗しました',

  composerPlaceholder: 'メッセージを入力',
  attachFile: 'ファイルを添付',
  sendMessage: '送信',
  removeAttachment: '削除',
  dropToAttach: 'ここにドロップして添付',
  sendFailed: 'メッセージの送信に失敗しました',
  fileTooLarge: (fileName) => `${fileName}: ファイルサイズは10MBまでです`,
  uploadFailed: (fileName) => `${fileName}のアップロードに失敗しました`,
};
