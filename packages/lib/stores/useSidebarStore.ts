import { create } from 'zustand';

interface SidebarStore {
  /** モバイル表示時のサイドメニュー開閉状態 */
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

/**
 * Header（ハンバーガーボタン）と Sidebar（ドロワー）が兄弟コンポーネントのため、
 * モバイル時の開閉状態をグローバルストアで共有する。
 */
export const useSidebarStore = create<SidebarStore>((set) => ({
  isOpen: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
