import { create } from 'zustand';
import { TrainingWord, PhraseItem } from '@/types/word';
import { AnalysisResult, FeedbackConfig } from '@/types/wordDrill';

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

  // 初期化：データ注入と開始位置の設定
  initDrill: (words, name, startW = 0, startP = 0) => set({
    words,
    contentName: name,
    wordIdx: startW,
    phraseIdx: startP,
    isFlipped: false,
    feedback: null,
    analysis: null,
    loading: false
  }),

  setLoading: (loading) => set({ loading }),

  // 【重要】次へ進む：全ステートを一括リセットして競合を防ぐ
  nextStep: () => {
    const { words, wordIdx, phraseIdx } = get();
    const currentWord = words[wordIdx];
    
    // 表示のリセット（反転・評価を消す）
    const resetDisplay = {
      isFlipped: false,
      feedback: null,
      analysis: null
    };

    if (phraseIdx < (currentWord?.phrases.length || 0) - 1) {
      // 同じ単語内の次のフレーズへ
      set({ ...resetDisplay, phraseIdx: phraseIdx + 1 });
      return { isLast: false };
    } else if (wordIdx < words.length - 1) {
      // 次の単語の最初のフレーズへ
      set({ ...resetDisplay, wordIdx: wordIdx + 1, phraseIdx: 0 });
      return { isLast: false };
    } else {
      // 全て終了
      set({ ...resetDisplay, isAutoPlaying: false });
      return { isLast: true };
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
    // 自動再生開始時は評価を一旦隠す
    feedback: val || !state.isAutoPlaying ? null : state.feedback
  })),

  setFeedback: (feedback) => set({ feedback }),
  setAnalysis: (analysis) => set({ analysis }),

  // 全単語データの差し替え（お気に入り更新時などに使用）
  updateWords: (words) => set({ words }),

  // 特定フレーズのお気に入り状態のみを高速に書き換える
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