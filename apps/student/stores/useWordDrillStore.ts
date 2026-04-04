import { create } from 'zustand';
import { TrainingWord } from '@gabby/types/word';
import { AnalysisResult, FeedbackConfig } from '@gabby/types/wordDrill';

interface WordDrillState {
  // --- Data States ---
  words: TrainingWord[];
  contentName: string;
  loading: boolean;
  
  // --- Progress States ---
  wordIdx: number;
  phraseIdx: number;
  sortOrder: 'default' | 'alpha';
  
  // --- UI States ---
  isFlipped: boolean;
  isAutoPlaying: boolean;
  showIndex: boolean;
  feedback: FeedbackConfig | null;
  analysis: AnalysisResult | null;

  // --- Actions ---
  initDrill: (words: TrainingWord[], name: string, startW?: number, startP?: number) => void;
  setLoading: (loading: boolean) => void;
  
  // Navigation
  nextStep: () => { isLast: boolean };
  prevStep: () => void; // 追加
  jumpTo: (wIdx: number, pIdx: number) => void;
  
  // UI Controls
  setIsFlipped: (val: boolean) => void;
  toggleFlip: () => void;
  setShowIndex: (show: boolean) => void;
  toggleAutoPlay: (val?: boolean) => void;
  setSortOrder: (order: 'default' | 'alpha') => void;
  
  // Feedback
  setFeedback: (config: FeedbackConfig | null) => void;
  setAnalysis: (result: AnalysisResult | null) => void;
  
  // Data Updates
  updateWords: (newWords: TrainingWord[]) => void;
  updatePhraseFavorite: (phraseId: string, isFavorite: boolean) => void;
  
  // Helper
  reset: () => void;
}

export const useWordDrillStore = create<WordDrillState>((set, get) => ({
  words: [],
  contentName: '',
  loading: true,
  wordIdx: 0,
  phraseIdx: 0,
  sortOrder: 'default',
  isFlipped: false,
  isAutoPlaying: false,
  showIndex: false,
  feedback: null,
  analysis: null,

  initDrill: (words, name, startW = 0, startP = 0) => set({
    words,
    contentName: name,
    wordIdx: startW,
    phraseIdx: startP,
    sortOrder: 'default',
    isFlipped: false,
    feedback: null,
    analysis: null,
    loading: false
  }),

  setLoading: (loading) => set({ loading }),

  // 次へ進む
  nextStep: () => {
    const { words, wordIdx, phraseIdx } = get();
    const currentWord = words[wordIdx];
    
    const resetDisplay = {
      isFlipped: false,
      feedback: null,
      analysis: null
    };

    if (phraseIdx < (currentWord?.phrases.length || 0) - 1) {
      set({ ...resetDisplay, phraseIdx: phraseIdx + 1 });
      return { isLast: false };
    } else if (wordIdx < words.length - 1) {
      set({ ...resetDisplay, wordIdx: wordIdx + 1, phraseIdx: 0 });
      return { isLast: false };
    } else {
      set({ ...resetDisplay, isAutoPlaying: false });
      return { isLast: true };
    }
  },

  // 【新規】前へ戻る
  prevStep: () => {
    const { words, wordIdx, phraseIdx } = get();

    const resetDisplay = {
      isFlipped: false,
      feedback: null,
      analysis: null
    };

    // 1. 最初の単語の最初のフレーズなら何もしない
    if (wordIdx === 0 && phraseIdx === 0) return;

    if (phraseIdx > 0) {
      // 2. 同じ単語内の前のフレーズへ
      set({ ...resetDisplay, phraseIdx: phraseIdx - 1 });
    } else {
      // 3. 前の単語の最後のフレーズへ移動
      const prevWordIdx = wordIdx - 1;
      const prevWord = words[prevWordIdx];
      set({ 
        ...resetDisplay, 
        wordIdx: prevWordIdx, 
        phraseIdx: (prevWord?.phrases.length || 1) - 1 
      });
    }
  },

  jumpTo: (wIdx, pIdx) => set({
    wordIdx: wIdx,
    phraseIdx: pIdx,
    isFlipped: false,
    isAutoPlaying: false,
    feedback: null,
    analysis: null,
    showIndex: false
  }),

  setIsFlipped: (val) => set({ isFlipped: val }),
  toggleFlip: () => set((state) => ({ isFlipped: !state.isFlipped })),
  setShowIndex: (show) => set({ showIndex: show }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
  
  toggleAutoPlay: (val) => set((state) => ({ 
    isAutoPlaying: val !== undefined ? val : !state.isAutoPlaying,
    feedback: val || !state.isAutoPlaying ? null : state.feedback
  })),

  setFeedback: (feedback) => set({ feedback }),
  setAnalysis: (analysis) => set({ analysis }),

  updateWords: (words) => set({ words }),

  updatePhraseFavorite: (phraseId, isFavorite) => {
    const { words } = get();
    const newWords = words.map(word => ({
      ...word,
      phrases: word.phrases.map(p => 
        p.phrase_id === phraseId ? { ...p, is_favorite: isFavorite } : p
      )
    }));
    set({ words: newWords });
  },

  reset: () => set({
    wordIdx: 0,
    phraseIdx: 0,
    isFlipped: false,
    isAutoPlaying: false,
    feedback: null,
    analysis: null
  })
}));