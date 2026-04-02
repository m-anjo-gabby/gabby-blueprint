'use client';
import { useConfirmStore } from '../stores/useConfirmStore';
import { useCallback } from 'react';

export const useConfirm = () => {
  const openConfirm = useConfirmStore((state) => state.openConfirm);

  /**
   * 確認ダイアログを表示する
   * @param title タイトル
   * @param message 説明文
   * @param options variant (色味) や isModal (背景クリック可否)
   */
  const showConfirm = useCallback(
    async (
      title: string,
      message: string,
      options: { variant?: 'danger' | 'warning' | 'info'; isModal?: boolean } = {}
    ) => {
      // ストアのアクションを呼び出して結果を待機
      return await openConfirm({
        title,
        message,
        variant: options.variant ?? 'danger',
        isModal: options.isModal ?? true,
      });
    },
    [openConfirm]
  );

  return { showConfirm };
};