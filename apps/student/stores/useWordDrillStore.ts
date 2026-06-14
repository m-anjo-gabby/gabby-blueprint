'use client';

import { create } from 'zustand';
import { TrainingWord } from '@gabby/types/word';
import { AnalysisResult, FeedbackConfig } from '@gabby/types/wordDrill';

// 表示状態（フリップ、フィードバック等）をリセットするための共通オブジェクト
const UI_RESET_STATE = {
  isFlipped: false,
  feedback: null,
  analysis: null,
};

interface WordDrillState {
  // --- Data States ---
  words: TrainingWord[];
  contentName: string;
  cefr: { id: string; label: string } | undefined;
  loading: boolean;
  
  // --- Progress States ---
  wordIdx: number;
  phraseIdx: number;
  sortOrder: 'default' | 'alpha';
  pendingWordCount: number;   // このセッション内で消化した（Nextを押した）単語数
  pendingPhraseCount: number; // このセッション内で消化した（Nextを押した）フレーズ数
  pendingAssessmentCount: number; // このセッション内で発話評価した回数
  
  // --- UI States ---
  isFlipped: boolean;
  isAutoPlaying: boolean;
  showIndex: boolean;
  feedback: FeedbackConfig | null;
  analysis: AnalysisResult | null;

  // --- Actions ---
  initDrill: (words: TrainingWord[], name: string, cefr?: { id: string; label: string }, startW?: number, startP?: number) => void;
  setLoading: (loading: boolean) => void;
  
  // Navigation
  nextStep: () => { isLast: boolean };
  prevStep: () => void;
  jumpTo: (wIdx: number, pIdx: number) => void;
  clearPendingCounts: () => { wordCount: number, phraseCount: number, assessmentCount: number }; // カウントを取得してリセット
  
  // UI Controls
  incrementAssessmentCount: () => void;
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
  cefr: undefined,
  loading: true,
  wordIdx: 0,
  phraseIdx: 0,
  sortOrder: 'default',
  pendingWordCount: 0,
  pendingPhraseCount: 0,
  pendingAssessmentCount: 0,
  isFlipped: false,
  isAutoPlaying: false,
  showIndex: false,
  feedback: null,
  analysis: null,

  initDrill: (words, name, cefr = undefined, startW = 0, startP = 0) => {
    set({
      words,
      contentName: name,
      cefr,
      wordIdx: startW,
      phraseIdx: startP,
      sortOrder: 'default',
      // 開いた瞬間もカウントする先行カウント方式
      pendingWordCount: 1,
      pendingPhraseCount: 1,
      pendingAssessmentCount: 0,
      ...UI_RESET_STATE,
      loading: false
    });
  },

  setLoading: (loading) => set({ loading }),

  // 次へ進む
  nextStep: () => {
    const { words, wordIdx, phraseIdx, pendingWordCount, pendingPhraseCount } = get();
    const currentWord = words[wordIdx];
    
    if (phraseIdx < (currentWord?.phrases.length || 0) - 1) {
      // 同じ単語内の次のフレーズへ
      set({ 
        ...UI_RESET_STATE, 
        phraseIdx: phraseIdx + 1, 
        pendingPhraseCount: pendingPhraseCount + 1 
      });
      return { isLast: false };
    } else if (wordIdx < words.length - 1) {
      // 次の単語へ
      set({ 
        ...UI_RESET_STATE, 
        wordIdx: wordIdx + 1, 
        phraseIdx: 0, 
        pendingWordCount: pendingWordCount + 1, 
        pendingPhraseCount: pendingPhraseCount + 1 
      });
      return { isLast: false };
    } else {
      // 全ての学習が終了
      set({ 
        ...UI_RESET_STATE, 
        isAutoPlaying: false,
        pendingWordCount: pendingWordCount + 1,
        pendingPhraseCount: pendingPhraseCount + 1
      });
      return { isLast: true };
    }
  },

  // 前へ戻る
  prevStep: () => {
    const { words, wordIdx, phraseIdx } = get();

    if (wordIdx === 0 && phraseIdx === 0) return;

    if (phraseIdx > 0) {
      set({ ...UI_RESET_STATE, phraseIdx: phraseIdx - 1 });
    } else {
      const prevWordIdx = wordIdx - 1;
      const prevWord = words[prevWordIdx];
      set({ 
        ...UI_RESET_STATE, 
        wordIdx: prevWordIdx, 
        phraseIdx: (prevWord?.phrases.length || 1) - 1 
      });
    }
  },

  // 💡 修正点：モジュール空間の変数を排除し、Zustand内のステートから安全に抽出・初期化
  clearPendingCounts: () => {
    const { pendingWordCount, pendingPhraseCount, pendingAssessmentCount } = get();

    set({ pendingWordCount: 0, pendingPhraseCount: 0, pendingAssessmentCount: 0 });
    
    return { 
      wordCount: pendingWordCount, 
      phraseCount: pendingPhraseCount,
      assessmentCount: pendingAssessmentCount
    };
  },

  // インデックスからジャンプ
  jumpTo: (wIdx, pIdx) => {
    const { pendingWordCount, pendingPhraseCount } = get();
    
    set({
      wordIdx: wIdx,
      phraseIdx: pIdx,
      // インデックスによるジャンプも「1ステップ学習を消化した」とみなす挙動を維持
      pendingWordCount: pendingWordCount + 1,
      pendingPhraseCount: pendingPhraseCount + 1,
      ...UI_RESET_STATE,
      isAutoPlaying: false,
      showIndex: false
    });
  },

  incrementAssessmentCount: () => set((state) => ({ 
    pendingAssessmentCount: state.pendingAssessmentCount + 1 
  })),
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
    pendingWordCount: 0,
    pendingPhraseCount: 0,
    ...UI_RESET_STATE,
    isAutoPlaying: false,
  })
}));