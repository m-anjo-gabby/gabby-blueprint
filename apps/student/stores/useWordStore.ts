// src/stores/useWordStore.ts
import { WordRecord } from '@/types/word';
import { create } from 'zustand';

interface WordState {
  lastUpdated: number; // 単語情報変化を特定する時刻
  selectedWord: WordRecord | null; // 現在選択中の単語オブジェクト
  triggerRefresh: () => void; // 時刻を更新して「変化」を作るアクション
  setSelectedWord: (word: WordRecord | null) => void; // 単語選択アクション
}

export const useWordStore = create<WordState>((set) => ({
  lastUpdated: Date.now(),
  selectedWord: null,
  triggerRefresh: () => set({ lastUpdated: Date.now() }),
  setSelectedWord: (word) => set({ selectedWord: word }),
}));