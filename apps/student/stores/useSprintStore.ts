'use client';

import { create } from 'zustand';
import { 
  SprintQuestion, 
  SprintQuestionType, 
  SprintAnswerType,
  // 💡 追加：マスタデータとデフォルトキーをインポート
  SPRINT_TIME_OPTIONS,
  DEFAULT_SPRINT_TIME_KEY 
} from "@gabby/types/sprint";
import { AnalysisResult, FeedbackConfig } from '@gabby/types/speechAssessment';

// 📝 1問題ごとの回答結果・スキップ結果を保持するデータ型
export interface SprintQuestionResult {
  questionId: string;
  currentIndex: number;
  isSkipped: boolean;
  feedback: FeedbackConfig | null;
  analysis: AnalysisResult | null;
  timestamp: number;
}

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
  
  // --- 🌟 このセッションの回答結果の履歴配列 ---
  sessionResults: SprintQuestionResult[];

  // --- Progress States ---
  pendingQuestionCount: number;
  pendingAssessmentCount: number;
  isActiveSession: boolean;

  initSprint: (questions: SprintQuestion[], mode: 'drill' | 'sprint', startIndex?: number) => void;
  setSprintConfig: (config: { contentId: string, sprintType: string, questionType: SprintQuestionType, level: string, answerType: SprintAnswerType, timeLimitSec: number }) => void;
  setLoading: (loading: boolean) => void;
  
  // --- 🌟 回答結果（発話）を履歴にコミットして次へ進むアクション ---
  commitAssessmentResult: (questionId: string, feedback: FeedbackConfig | null, analysis: AnalysisResult | null) => { isLast: boolean };
  // --- 🌟 スキップした情報を履歴にコミットして次へ進むアクション ---
  commitSkipResult: (questionId: string) => { isLast: boolean };

  nextStep: () => { isLast: boolean };
  prevStep: () => void;
  clearPendingCounts: () => { questionCount: number, assessmentCount: number, results: SprintQuestionResult[] };
  incrementAssessmentCount: () => void;
  setIsRevealed: (val: boolean) => void;
  setIsRecording: (val: boolean) => void;
  toggleAutoPlay: (val?: boolean) => void;
  setPlayingQuestionSequence: (val: boolean) => void;
  setPlayingAnswerSequence: (val: boolean) => void;
  setFeedback: (val: FeedbackConfig | null) => void;
  setAnalysis: (val: AnalysisResult | null) => void;
  setPlayingAudio?: (val: HTMLAudioElement | null) => void;
  setDrillEvalType: (val: 'yes' | 'no') => void;
  setIsActiveSession: () => void;
  clearIsActiveSession: () => void;
  clearSession: () => void;
  resetStore: () => void;
}

// 💡 ストア全体で共有するデフォルト秒数をマスタから安全に評価 (フォールバック付き)
const STORE_DEFAULT_TIME = SPRINT_TIME_OPTIONS[DEFAULT_SPRINT_TIME_KEY]?.value ?? 90;

export const useSprintStore = create<SprintState>((set, get) => ({
  questions: [],
  currentIndex: 0,
  mode: 'drill',
  contentId: '',
  sprintType: '0',
  questionType: null,
  level: '0',
  answerType: '0',
  timeLimitSec: STORE_DEFAULT_TIME, // 💡 修正：動的デフォルト値へ変更
  loading: true,
  drillEvalType: 'yes',
  isRevealed: false,
  isAutoPlaying: false,
  isRecording: false,
  isPlayingQuestionSequence: false,
  isPlayingAnswerSequence: false,
  feedback: null,
  analysis: null,
  
  // 🌟 初期値
  sessionResults: [],

  pendingQuestionCount: 0,
  pendingAssessmentCount: 0,
  isActiveSession: false,

  initSprint: (questions, mode, startIndex = 0) => set({
    questions,
    mode,
    currentIndex: startIndex,
    isRevealed: false,
    isAutoPlaying: mode === 'sprint',
    drillEvalType: get().answerType === '1' ? 'no' : 'yes',
    isRecording: false,
    isPlayingQuestionSequence: false,
    isPlayingAnswerSequence: false,
    feedback: null,
    analysis: null,
    sessionResults: [], // 🌟 セッション開始時にクリア
    pendingQuestionCount: 1,
    pendingAssessmentCount: 0,
    loading: false
  }),

  setLoading: (loading) => set({ loading }),
  setSprintConfig: (config) => set({ ...config }),

  // 🌟 追加：発話結果を保存して進む
  commitAssessmentResult: (questionId, feedback, analysis) => {
    const { sessionResults, currentIndex } = get();
    const newResult: SprintQuestionResult = {
      questionId,
      currentIndex,
      isSkipped: false,
      feedback,
      analysis,
      timestamp: Date.now()
    };
    
    set({ sessionResults: [...sessionResults, newResult] });
    return get().nextStep();
  },

  // 🌟 追加：スキップ情報を保存して進む
  commitSkipResult: (questionId) => {
    const { sessionResults, currentIndex } = get();
    const newResult: SprintQuestionResult = {
      questionId,
      currentIndex,
      isSkipped: true,
      feedback: null,
      analysis: null,
      timestamp: Date.now()
    };

    set({ sessionResults: [...sessionResults, newResult] });
    return get().nextStep();
  },

  nextStep: () => {
    const { questions, currentIndex, pendingQuestionCount } = get();
    const resetDisplay = {
      isRevealed: false,
      isRecording: false,
      isPlayingQuestionSequence: false,
      isPlayingAnswerSequence: false,
      feedback: null,
      analysis: null,
    };

    if (currentIndex < questions.length - 1) {
      set({ 
        ...resetDisplay, 
        currentIndex: currentIndex + 1,
        pendingQuestionCount: pendingQuestionCount + 1
      });
      return { isLast: false };
    } else {
      set({ 
        ...resetDisplay, 
        isAutoPlaying: false,
        pendingQuestionCount: pendingQuestionCount + 1
      });
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
      feedback: null,
      analysis: null,
      currentIndex: currentIndex - 1
    });
  },

  // 🌟 保存フェーズに向けてリセット時に履歴配列も一緒に返す
  clearPendingCounts: () => {
    const { pendingQuestionCount, pendingAssessmentCount, sessionResults } = get();

    set({ pendingQuestionCount: 0, pendingAssessmentCount: 0, sessionResults: [] });
    
    return { 
      questionCount: pendingQuestionCount, 
      assessmentCount: pendingAssessmentCount,
      results: sessionResults
    };
  },

  incrementAssessmentCount: () => set((state) => ({
    pendingAssessmentCount: state.pendingAssessmentCount + 1
  })),

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
    sessionResults: [],
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
    timeLimitSec: STORE_DEFAULT_TIME, // 💡 修正：リセット時も動的デフォルト値へ変更
    isRevealed: false,
    isAutoPlaying: false,
    isRecording: false,
    isPlayingQuestionSequence: false,
    isPlayingAnswerSequence: false,
    feedback: null,
    analysis: null,
    sessionResults: [],
    loading: true,
    pendingQuestionCount: 0,
    pendingAssessmentCount: 0,
    isActiveSession: false,
  })
}));