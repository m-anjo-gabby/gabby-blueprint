// @/stores/useSprintStore
'use client';

import { create } from 'zustand';
import { SprintQuestion, SprintQuestionType, SprintAnswerType } from "@gabby/types/sprint";

interface SprintState {
  questions: SprintQuestion[];
  currentIndex: number;
  mode: 'drill' | 'sprint';
  contentId: string;
  questionType: SprintQuestionType | null;
  level: string;
  answerType: SprintAnswerType;
  timeLimitSec: number;
  loading: boolean;
  isRevealed: boolean;
  isAutoPlaying: boolean;
  isRecording: boolean;
  isPlayingQuestionSequence: boolean;
  isPlayingAnswerSequence: boolean;

  initSprint: (questions: SprintQuestion[], mode: 'drill' | 'sprint', startIndex?: number) => void;
  setSprintConfig: (config: { contentId: string, questionType: SprintQuestionType, level: string, answerType: SprintAnswerType, timeLimitSec: number }) => void;
  setLoading: (loading: boolean) => void;
  nextStep: () => { isLast: boolean };
  prevStep: () => void;
  setIsRevealed: (val: boolean) => void;
  setIsRecording: (val: boolean) => void;
  toggleAutoPlay: (val?: boolean) => void;
  setPlayingQuestionSequence: (val: boolean) => void;
  setPlayingAnswerSequence: (val: boolean) => void;
  resetStore: () => void;
}

export const useSprintStore = create<SprintState>((set, get) => ({
  questions: [],
  currentIndex: 0,
  mode: 'drill',
  contentId: '',
  questionType: null,
  level: '0',
  answerType: '0',
  timeLimitSec: 60,
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
    isAutoPlaying: mode === 'sprint', // スプリント時は最初から自動再生フラグを有効化
    isRecording: false,
    isPlayingQuestionSequence: false,
    isPlayingAnswerSequence: false,
    loading: false
  }),

  setLoading: (loading) => set({ loading }),

  setSprintConfig: (config) => set({ ...config }),

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
      return { isLast: true }; // 最後の問題に到達
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
      return {
        isAutoPlaying: true,
        isRevealed: false, 
        isRecording: false,
        isPlayingQuestionSequence: false,
        isPlayingAnswerSequence: false,
      };
    } else {
      return { isAutoPlaying: false };
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