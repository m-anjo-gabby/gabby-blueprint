'use client';

import { useTranslations } from 'next-intl';
import type { ChatActionErrorCode } from '@gabby/types/chat';

/**
 * チャットのアクションの失敗（errorCode）を表示言語の文言にする。
 * 想定外の失敗は、操作ごとの文言（「作成に失敗しました」等）を fallback で渡す。
 */
export function useChatErrorMessage() {
  const t = useTranslations('chat.errors');
  return (errorCode: ChatActionErrorCode, fallback: string) =>
    errorCode === 'unexpected_error' ? fallback : t(errorCode);
}
