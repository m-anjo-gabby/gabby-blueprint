import { create } from 'zustand';

interface WordState {
  // ...既存の状態
  lastUpdated: number;
  triggerRefresh: () => void;
}

export const useWordStore = create<WordState>((set) => ({
  // ...既存の状態
  lastUpdated: Date.now(),
  triggerRefresh: () => set({ lastUpdated: Date.now() }), // 時刻を更新して「変化」を作る
}));