import { create } from 'zustand';
import { CVWordSummary } from '@/actions/adminCVDictionaryAction';

interface CVDictionaryState {
  lastUpdated: number;
  selectedWord: CVWordSummary | null;
  triggerRefresh: () => void;
  setSelectedWord: (word: CVWordSummary | null) => void;
}

export const useCVDictionaryStore = create<CVDictionaryState>((set) => ({
  lastUpdated: Date.now(),
  selectedWord: null,
  triggerRefresh: () => set({ lastUpdated: Date.now() }),
  setSelectedWord: (word) => set({ selectedWord: word }),
}));
