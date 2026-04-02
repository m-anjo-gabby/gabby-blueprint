'use client';

import { useToastStore } from '../stores/useToastStore';
import { useCallback } from 'react';

/**
 * トースト通知（簡易通知）を操作するためのカスタムフック
 * * アプリケーションのどこからでも呼び出し可能で、
 * 指定したメッセージを画面下部に一定時間表示します。
 * * @returns {Object} showToast - 通知を表示するための関数
 */
export const useToast = () => {
  const addToast = useToastStore((state) => state.addToast);
  const removeToast = useToastStore((state) => state.removeToast);

  /**
   * トースト通知を表示する
   * * 表示から3秒経過すると、自動的に画面から消去されます。
   * * @param {string} message - 表示するメッセージ
   * @param {'info' | 'success' | 'error'} [type='info'] - 通知の種類（見た目の色味）
   * * @example
   * const { showToast } = useToast();
   * showToast("保存が完了しました", "success");
   */
  const showToast = useCallback((
    message: string, 
    type: 'info' | 'success' | 'error' = 'info'
  ) => {
    // ストアに登録し、一意のIDを取得
    const id = addToast(message, type);

    // 3000ms（3秒）後に自動削除するロジックをHookで一元管理
    setTimeout(() => {
      removeToast(id);
    }, 3000);
  }, [addToast, removeToast]);

  return { showToast };
};