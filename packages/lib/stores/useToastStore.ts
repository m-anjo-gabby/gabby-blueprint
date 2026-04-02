import { create } from 'zustand';
import { Toast } from '../..//types/toast';

/**
 * トースト通知の状態管理を行うStore
 * Zustandを使用し、アプリ全域から通知を表示・削除できる
 */
type ToastStore = {
  // 表示中のトーストリスト
  toasts: Toast[];
  // トーストを表示する（メッセージとタイプを指定、3秒後に自動消去）
  addToast: (message: string, type?: Toast['type']) => number;
  // 手動でトーストを削除する
  removeToast: (id: number) => void;
};

let idCounter = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  /**
   * 新しいトーストを追加し、一定時間後に自動で削除する
   */
  addToast: (message, type) => {
    const id = idCounter++;
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }));
    return id;
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