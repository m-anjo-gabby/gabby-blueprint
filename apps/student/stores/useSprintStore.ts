// @/stores/useSprintStore
'use client';

import { create } from 'zustand';
import { SprintQuestion, SprintQuestionType, SprintAnswerType } from "@gabby/types/sprint";
import { AnalysisResult, FeedbackConfig } from '@gabby/types/wordDrill';

interface SprintState {
  questions: SprintQuestion[];
  currentIndex: number;
  mode: 'drill' | 'sprint';
  contentId: string;
  sprintType: string;
  questionType: SprintQuestionType | null;
  level: string;
  answerType: SprintAnswerType;
  timeLimitSec: number;
  loading: boolean;
  drillEvalType: 'yes' | 'no';
  isRevealed: boolean;
  isAutoPlaying: boolean;
  isRecording: boolean;
  isPlayingQuestionSequence: boolean;
  isPlayingAnswerSequence: boolean;
  feedback: FeedbackConfig | null;
  analysis: AnalysisResult | null;
  /**
   * プレイヤー画面からSprintSelect（設定画面）に戻ってきたことを示すフラグ。
   * true の場合のみストア値を初期値として使用し、DBフェッチをスキップする。
   * SprintSelect のマウント後に clearIsActiveSession() で必ずリセットされる。
   */
  isActiveSession: boolean;

  initSprint: (questions: SprintQuestion[], mode: 'drill' | 'sprint', startIndex?: number) => void;
  setSprintConfig: (config: { contentId: string, sprintType: string, questionType: SprintQuestionType, level: string, answerType: SprintAnswerType, timeLimitSec: number }) => void;
  setLoading: (loading: boolean) => void;
  nextStep: () => { isLast: boolean };
  prevStep: () => void;
  setIsRevealed: (val: boolean) => void;
  setIsRecording: (val: boolean) => void;
  toggleAutoPlay: (val?: boolean) => void;
  setPlayingQuestionSequence: (val: boolean) => void;
  setPlayingAnswerSequence: (val: boolean) => void;
  setFeedback: (val: FeedbackConfig | null) => void;
  setAnalysis: (val: AnalysisResult | null) => void;
  setPlayingAudio?: (val: HTMLAudioElement | null) => void;
  setDrillEvalType: (val: 'yes' | 'no') => void;
  /** プレイヤーへ遷移する直前に呼び出し、「セッション継続中」フラグを立てる */
  setIsActiveSession: () => void;
  /** SprintSelect マウント後に呼び出し、フラグをリセットする */
  clearIsActiveSession: () => void;
  clearSession: () => void;
  resetStore: () => void;
}

export const useSprintStore = create<SprintState>((set, get) => ({
  questions: [],
  currentIndex: 0,
  mode: 'drill',
  contentId: '',
  sprintType: '0',
  questionType: null,
  level: '0',
  answerType: '0',
  timeLimitSec: 60,
  loading: true,
  drillEvalType: 'yes',
  isRevealed: false,
  isAutoPlaying: false,
  isRecording: false,
  isPlayingQuestionSequence: false,
  isPlayingAnswerSequence: false,
  feedback: null,
  analysis: null,
  isActiveSession: false,

  initSprint: (questions, mode, startIndex = 0) => set({
    questions,
    mode,
    currentIndex: startIndex,
    isRevealed: false,
    isAutoPlaying: mode === 'sprint', // スプリント時は最初から自動再生フラグを有効化
    drillEvalType: get().answerType === '1' ? 'no' : 'yes',
    isRecording: false,
    isPlayingQuestionSequence: false,
    isPlayingAnswerSequence: false,
    feedback: null,
    analysis: null,
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
      feedback: null,
      analysis: null,
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
      feedback: null,
      analysis: null,
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
        feedback: null,
        analysis: null,
      };
    } else {
      return { isAutoPlaying: false };
    }
  }),

  setPlayingQuestionSequence: (isPlayingQuestionSequence) => set({ isPlayingQuestionSequence }),
  setPlayingAnswerSequence: (isPlayingAnswerSequence) => set({ isPlayingAnswerSequence }),

  setFeedback: (feedback) => set({ feedback }),
  setAnalysis: (analysis) => set({ analysis }),

  setDrillEvalType: (drillEvalType) => set({ drillEvalType }),

  setIsActiveSession: () => set({ isActiveSession: true }),

  clearIsActiveSession: () => set({ isActiveSession: false }),

  clearSession: () => set({
    questions: [],
    currentIndex: 0,
    isRevealed: false,
    isAutoPlaying: false,
    isRecording: false,
    isPlayingQuestionSequence: false,
    isPlayingAnswerSequence: false,
    drillEvalType: 'yes',
    feedback: null,
    analysis: null,
    loading: true,
  }),

  resetStore: () => set({
    questions: [],
    currentIndex: 0,
    mode: 'drill',
    contentId: '',
    sprintType: '0',
    questionType: null,
    level: '0',
    answerType: '0',
    timeLimitSec: 60,
    isRevealed: false,
    isAutoPlaying: false,
    isRecording: false,
    isPlayingQuestionSequence: false,
    isPlayingAnswerSequence: false,
    feedback: null,
    analysis: null,
    loading: true,
    isActiveSession: false,
  })
}));