import type { ChatLabels, ChatSplitBreakpoint } from '@gabby/lib/components/chat/ChatUiContext';
import { USER_TYPES } from '@gabby/types/user';

/** 2ペイン（ルーム一覧＋ルーム）で表示する画面幅 */
export const CHAT_SPLIT_BREAKPOINT: ChatSplitBreakpoint = 'md';

export const CHAT_LABELS: ChatLabels = {
  dateLocale: 'en-US',
  yesterday: 'Yesterday',
  userType: {
    [USER_TYPES.ADMIN]: 'Admin',
    [USER_TYPES.STUDENT]: 'Student',
    [USER_TYPES.COACH]: 'Coach',
  },
  unnamedUser: 'Unknown user',
  unnamedGroup: 'Unnamed group',
  groupBadge: 'Group',
  preview: {
    deleted: 'This message was deleted',
    photo: '📷 Photo',
    file: '📎 File',
    noMessages: 'No messages yet',
  },

  listTitle: 'Chat',
  searchPlaceholder: 'Search by name or message',
  clearSearch: 'Clear search',
  filterAll: 'All',
  filterUnread: 'Unread',
  noRooms: 'No chat rooms yet',
  noRoomsHint: 'An admin will create a chat room for you to start a conversation.',
  noMatchingRooms: 'No matching chat rooms',
  notMemberBadge: 'Not a member',

  selectRoomTitle: 'Select a conversation',
  selectRoomHint: 'Choose a chat room from the list to read and reply to messages.',
  roomUnavailableTitle: 'This chat room is not available',
  roomUnavailableHint: 'The room may have been closed, or you may no longer be a participant. Please open it again from the list.',

  backToList: 'Back to chat list',
  reviewModeBadge: 'Review mode',
  viewOnlyNotice: 'You are not a participant of this room, so you cannot send messages here.',
  unreadDivider: 'New messages',
  jumpToLatest: 'Jump to latest',
  newMessages: (count) => `${count} new message${count === 1 ? '' : 's'}`,
  readReceipt: 'Seen',
  deletedMessage: 'This message was deleted',
  attachmentFailed: 'Failed to load attachment',
  deleteMessage: 'Delete',
  deleteMessageConfirmTitle: 'Delete Message',
  deleteMessageConfirmBody: 'This message will be deleted. This action cannot be undone. Are you sure?',
  deleteMessageFailed: 'Failed to delete the message',

  composerPlaceholder: 'Type a message',
  attachFile: 'Attach a file',
  sendMessage: 'Send',
  removeAttachment: 'Remove',
  sendFailed: 'Failed to send message',
  fileTooLarge: (fileName) => `${fileName}: File size must be 10MB or less`,
  uploadFailed: (fileName) => `Failed to upload ${fileName}`,
};
