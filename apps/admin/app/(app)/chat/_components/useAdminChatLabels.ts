'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ChatLabels } from '@gabby/lib/components/chat/ChatUiContext';
import { getUserTypeLabel, USER_TYPES } from '@gabby/types/user';

/** 共通チャットUIに渡す文言を、表示中のロケールの翻訳から組み立てる */
export function useAdminChatLabels(): ChatLabels {
  const t = useTranslations('chat');
  const locale = useLocale();

  return useMemo<ChatLabels>(
    () => ({
      dateLocale: locale === 'en' ? 'en-US' : 'ja-JP',
      yesterday: t('timeline.yesterdayLabel'),
      // ユーザー種別の表示名は packages/types 由来（翻訳カタログ対象外の既知の課題）
      userType: {
        [USER_TYPES.ADMIN]: getUserTypeLabel(USER_TYPES.ADMIN),
        [USER_TYPES.STUDENT]: getUserTypeLabel(USER_TYPES.STUDENT),
        [USER_TYPES.COACH]: getUserTypeLabel(USER_TYPES.COACH),
      },
      unnamedUser: t('common.unnamed'),
      unnamedGroup: t('common.unnamed'),
      groupBadge: t('roomList.groupBadge'),
      preview: {
        deleted: t('roomList.previewDeleted'),
        photo: t('roomList.previewPhoto'),
        file: t('roomList.previewFile'),
        noMessages: t('roomList.previewNoMessages'),
      },

      listTitle: t('page.title'),
      searchPlaceholder: t('roomList.searchPlaceholder'),
      clearSearch: t('roomList.clearSearch'),
      filterAll: t('roomList.filterAll'),
      filterUnread: t('roomList.filterUnread'),
      noRooms: t('roomList.noRooms'),
      noRoomsHint: t('roomList.createHint'),
      noMatchingRooms: t('roomList.noMatchingRooms'),
      notMemberBadge: t('roomList.notMemberBadge'),

      selectRoomTitle: t('page.selectRoomTitle'),
      selectRoomHint: t('page.selectRoomHint'),

      backToList: t('timeline.backAriaLabel'),
      reviewModeBadge: t('timeline.reviewModeBadge'),
      viewOnlyNotice: t('timeline.viewOnlyNotice'),
      unreadDivider: t('timeline.unreadDivider'),
      jumpToLatest: t('timeline.jumpToLatest'),
      newMessages: (count) => t('timeline.newMessages', { count }),
      deletedMessage: t('messageContent.deletedMessage'),
      attachmentFailed: t('messageContent.attachmentFetchFailed'),
      deleteMessage: t('timeline.deleteTooltip'),
      deleteMessageConfirmTitle: t('timeline.deleteMessageConfirmTitle'),
      deleteMessageConfirmBody: t('timeline.deleteMessageConfirmBody'),
      deleteMessageFailed: t('timeline.toastDeleteFailed'),

      composerPlaceholder: t('messageInput.placeholder'),
      attachFile: t('messageInput.attachFile'),
      sendMessage: t('messageInput.sendMessage'),
      removeAttachment: t('messageInput.removeTooltip'),
      sendFailed: t('messageInput.toastSendFailed'),
      fileTooLarge: (name) => t('messageInput.toastFileSizeError', { name }),
      uploadFailed: (name) => t('messageInput.toastUploadFailed', { name }),
    }),
    [t, locale]
  );
}
