'use client';
import { create } from 'zustand';
import { Toast } from '@/types/toast';

/**
 * トースト通知の状態管理を行うStore
 * Zustandを使用し、アプリ全域から通知を表示・削除できる
 */
type ToastStore = {
  // 表示中のトーストリスト
  toasts: Toast[];
  // トーストを表示する（メッセージとタイプを指定、3秒後に自動消去）
  showToast: (message: string, type?: Toast['type']) => void;
  // 手動でトーストを削除する
  removeToast: (id: number) => void;
};

// トーストの一意識別用カウンター（再レンダリングでリセットされないようスコープ外で定義）
let idCounter = 0;

export const useToast = create<ToastStore>((set) => ({
  toasts: [],

  /**
   * 新しいトーストを追加し、一定時間後に自動で削除する
   */
  showToast: (message, type = 'info') => {
    const id = idCounter++;

    // トーストを追加
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }));

    // 3000ms (3秒) 後に該当のトーストを自動削除
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 3000);
  },

  /**
   * 指定したIDのトーストをリストから即座に削除する
   * （主にユーザーの閉じる操作や、Framer Motionのexit transition用）
   */
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));