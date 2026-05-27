// @/stores/useSprintStore
'use client';

import { create } from 'zustand';
import { SprintQuestion } from "@gabby/types/sprint";

interface SprintState {
  // --- Data States ---
  questions: SprintQuestion[];
  currentIndex: number;
  mode: 'drill' | 'sprint';
  loading: boolean;

  // --- UI States ---
  isRevealed: boolean;
  isAutoPlaying: boolean;
  isRecording: boolean;
  
  // --- Lock / Phase Flags (タイミングバグを防ぐ強固なフラグ) ---
  isPlayingQuestionSequence: boolean;
  isPlayingAnswerSequence: boolean;

  // --- Actions ---
  initSprint: (questions: SprintQuestion[], mode: 'drill' | 'sprint', startIndex?: number) => void;
  setLoading: (loading: boolean) => void;
  
  // Navigation
  nextStep: () => { isLast: boolean };
  prevStep: () => void;
  
  // UI Controls
  setIsRevealed: (val: boolean) => void;
  setIsRecording: (val: boolean) => void;
  toggleAutoPlay: (val?: boolean) => void;
  
  // Sequence Locks
  setPlayingQuestionSequence: (val: boolean) => void;
  setPlayingAnswerSequence: (val: boolean) => void;
  
  resetStore: () => void;
}

export const useSprintStore = create<SprintState>((set, get) => ({
  questions: [],
  currentIndex: 0,
  mode: 'drill',
  loading: true,
  isRevealed: false,
  isAutoPlaying: false,
  isRecording: false,
  isPlayingQuestionSequence: false,
  isPlayingAnswerSequence: false,

  initSprint: (questions, mode, startIndex = 0) => set({
    questions,
    mode,
    currentIndex: startIndex,
    isRevealed: false,
    isAutoPlaying: false,
    isRecording: false,
    isPlayingQuestionSequence: false,
    isPlayingAnswerSequence: false,
    loading: false
  }),

  setLoading: (loading) => set({ loading }),

  nextStep: () => {
    const { questions, currentIndex } = get();
    const resetDisplay = {
      isRevealed: false,
      isRecording: false,
      isPlayingQuestionSequence: false,
      isPlayingAnswerSequence: false,
    };

    if (currentIndex < questions.length - 1) {
      set({ ...resetDisplay, currentIndex: currentIndex + 1 });
      return { isLast: false };
    } else {
      set({ ...resetDisplay, isAutoPlaying: false });
      return { isLast: true };
    }
  },

  prevStep: () => {
    const { currentIndex } = get();
    if (currentIndex === 0) return;

    set({
      isRevealed: false,
      isRecording: false,
      isPlayingQuestionSequence: false,
      isPlayingAnswerSequence: false,
      currentIndex: currentIndex - 1
    });
  },

  setIsRevealed: (isRevealed) => set({ isRevealed }),
  setIsRecording: (isRecording) => set({ isRecording }),
  
  toggleAutoPlay: (val) => set((state) => {
    const nextAutoPlay = val !== undefined ? val : !state.isAutoPlaying;

    if (nextAutoPlay) {
      // 🟩 【開始時】進捗（currentIndex）はそのままに、カードを未開示に戻して先頭からリスタート
      return {
        isAutoPlaying: true,
        isRevealed: false, 
        isRecording: false,
        isPlayingQuestionSequence: false,
        isPlayingAnswerSequence: false,
      };
    } else {
      // 🟥 【停止時】その瞬間の開示状態（isRevealed）をキープし、勝手な遷移をガード
      return {
        isAutoPlaying: false
      };
    }
  }),

  setPlayingQuestionSequence: (isPlayingQuestionSequence) => set({ isPlayingQuestionSequence }),
  setPlayingAnswerSequence: (isPlayingAnswerSequence) => set({ isPlayingAnswerSequence }),

  resetStore: () => set({
    currentIndex: 0,
    isRevealed: false,
    isAutoPlaying: false,
    isRecording: false,
    isPlayingQuestionSequence: false,
    isPlayingAnswerSequence: false,
  })
}));