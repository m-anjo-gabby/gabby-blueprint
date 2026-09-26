'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { setAudioSessionPlayback } from '@gabby/lib';
import type { SprintQuestion } from '@gabby/types/sprint';
import type { SprintResultScore } from './types';

/**
 * 進行中の再生アクション種別。'all' 実施中は他の再生操作を無効化し、
 * 'sequence'/'single' 実施中に別の再生操作が来た場合はトークンを進めて即座に中断・切替する。
 */
export type SprintPlaybackMode = 'all' | 'sequence' | 'single' | null;

/** 文ごとの音声ID（共通オーディオフックの再生中IDと突き合わせる） */
export const sprintAudioId = {
  statement: (questionId: string) => `${questionId}-st`,
  question: (questionId: string) => `${questionId}-q`,
  yes: (questionId: string) => `${questionId}-yes`,
  no: (questionId: string) => `${questionId}-no`,
  answer: (questionId: string) => `${questionId}-ans`,
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 実施時の回答タイプ（YES/NO）に応じた解答文の音声 */
function getAnswerAudio(q: SprintQuestion, scoreData: SprintResultScore) {
  const isNo = scoreData.answer_type === '1';
  const voice = isNo ? q.answer_sentence_no_voice : q.answer_sentence_yes_voice;
  if (scoreData.question_type !== '0') return { id: sprintAudioId.answer(q.question_id), voice };
  return { id: isNo ? sprintAudioId.no(q.question_id) : sprintAudioId.yes(q.question_id), voice };
}

interface Options {
  /** 「全て再生」が完了または停止されたとき */
  onPlayAllSettled?: () => void;
}

/**
 * スプリント結果画面の音声再生（個別・問題ごと・全て再生）。
 * 実施直後の没入画面と、履歴から開くシェル画面で共通に使う。
 */
export function useSprintResultPlayback(
  scoreData: SprintResultScore,
  questions: SprintQuestion[],
  { onPlayAllSettled }: Options = {}
) {
  const { play, stop, isPlaying: playingAudioId, unlockAudioContext, resumeStatus } = usePlayAudioSpeech();

  const [focusedQuestionId, setFocusedQuestionId] = useState<string | null>(null);
  const [playbackMode, setPlaybackMode] = useState<SprintPlaybackMode>(null);
  const playbackTokenRef = useRef(0);
  const isMountedRef = useRef(true);
  const onPlayAllSettledRef = useRef(onPlayAllSettled);

  useEffect(() => {
    onPlayAllSettledRef.current = onPlayAllSettled;
  }, [onPlayAllSettled]);

  const stopAllAudio = useCallback(() => {
    stop();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [stop]);

  useEffect(() => {
    isMountedRef.current = true;
    // 前の画面でマイクが使われていた場合、確実にスピーカー出力へ戻す
    setAudioSessionPlayback();

    return () => {
      isMountedRef.current = false;
      stopAllAudio();
    };
  }, [stopAllAudio]);

  // 全て再生中は、再生中の問題カードを画面中央へスクロールする
  useEffect(() => {
    if (!focusedQuestionId || playbackMode !== 'all') return;
    document.getElementById(`card-${focusedQuestionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusedQuestionId, playbackMode]);

  /** 1問分（基本文→質問文/指示文→解答文）を順番に再生する。途中で中断された場合は false */
  const playQuestionSequence = useCallback(
    async (q: SprintQuestion, isCancelled: () => boolean) => {
      if (scoreData.question_type !== '0' && q.statement_en && q.statement_voice) {
        await play(q.statement_voice, sprintAudioId.statement(q.question_id), { restart: true });
        if (isCancelled()) return false;
        await wait(400);
      }
      if (isCancelled()) return false;
      if (q.question_voice) {
        await play(q.question_voice, sprintAudioId.question(q.question_id), { restart: true });
      }
      if (isCancelled()) return false;
      await wait(400);

      if (isCancelled()) return false;
      const answer = getAnswerAudio(q, scoreData);
      if (answer.voice) {
        await play(answer.voice, answer.id, { restart: true });
      }
      return !isCancelled();
    },
    [play, scoreData]
  );

  /** 文を1つだけ再生する（全て再生中は無効） */
  const playPhrase = useCallback(
    async (questionId: string, audioId: string, voice: string | null) => {
      if (!isMountedRef.current || playbackMode === 'all') return;

      const token = ++playbackTokenRef.current;
      setPlaybackMode('single');
      setFocusedQuestionId(questionId);

      if (voice) {
        await play(voice, audioId, { restart: true });
      }

      if (isMountedRef.current && playbackTokenRef.current === token) {
        setPlaybackMode(null);
      }
    },
    [play, playbackMode]
  );

  /** 1問分を続けて再生する（全て再生中は無効） */
  const playQuestion = useCallback(
    async (q: SprintQuestion) => {
      if (playbackMode === 'all') return;

      const token = ++playbackTokenRef.current;
      setPlaybackMode('sequence');
      stopAllAudio();
      if (!isMountedRef.current) return;
      setFocusedQuestionId(q.question_id);

      try {
        await playQuestionSequence(q, () => !isMountedRef.current || playbackTokenRef.current !== token);
      } catch (e) {
        console.error('Single sequence play error:', e);
      } finally {
        if (isMountedRef.current && playbackTokenRef.current === token) {
          setFocusedQuestionId(null);
          setPlaybackMode(null);
        }
      }
    },
    [playbackMode, stopAllAudio, playQuestionSequence]
  );

  /** 全問題を順番に再生する。再生中に呼ぶと停止する */
  const togglePlayAll = useCallback(async () => {
    if (playbackMode === 'all') {
      playbackTokenRef.current++;
      setPlaybackMode(null);
      stopAllAudio();
      setFocusedQuestionId(null);
      onPlayAllSettledRef.current?.();
      return;
    }

    const token = ++playbackTokenRef.current;
    setPlaybackMode('all');
    stopAllAudio();
    const isCancelled = () => !isMountedRef.current || playbackTokenRef.current !== token;

    try {
      for (const q of questions) {
        if (isCancelled()) break;
        setFocusedQuestionId(q.question_id);
        if (!(await playQuestionSequence(q, isCancelled))) break;
        await wait(800);
      }
    } finally {
      if (isMountedRef.current && playbackTokenRef.current === token) {
        setPlaybackMode(null);
        setFocusedQuestionId(null);
        onPlayAllSettledRef.current?.();
      }
    }
  }, [playbackMode, questions, stopAllAudio, playQuestionSequence]);

  return {
    focusedQuestionId,
    playbackMode,
    playingAudioId,
    playPhrase,
    playQuestion,
    togglePlayAll,
    resumeStatus,
    unlockAudioContext,
  };
}

export type SprintResultPlayback = ReturnType<typeof useSprintResultPlayback>;
