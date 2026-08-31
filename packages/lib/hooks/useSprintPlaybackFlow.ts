'use client';

import { useCallback, useEffect, useRef } from 'react';
import { SPRINT_FLOW_TIMING, SprintQuestion } from '@gabby/types/sprint';
import { setAudioSessionPlayback } from '../sprint/utils';

export interface PlayStatementThenQuestionOptions {
  /** テキスト・音声パスを受け取り再生する関数（各プレイヤーが持つ playTrack をそのまま渡す） */
  playTrack: (text: string, audioPath: string | null) => Promise<void>;
  /** 呼び出し時点でこのフローが割り込みキャンセルされているかを判定する関数（flowIdRef比較など） */
  isCancelled: () => boolean;
  /** 基本文と問いの間の待機時間（ms）。省略時は SPRINT_FLOW_TIMING.shared.statementQuestionGapMs */
  gapMs?: number;
  /** 基本文の再生を開始する直前に呼ばれる（UIのフェーズ表示切り替え用） */
  onStatementPhase?: () => void;
  /** 問いの再生を開始する直前に呼ばれる（基本文が無い場合も呼ばれる） */
  onQuestionPhase?: () => void;
}

/**
 * Drill/Sprint両プレイヤーで完全に一致している「基本文再生→間隔待機→問い再生」の
 * 前半シーケンスのみを抽出した共通関数。
 * reveal待ちや自動再生タイマー、録音開始などモード固有の分岐は各プレイヤー側に残し、
 * ここでは含めない。
 */
export async function playStatementThenQuestion(
  question: Pick<SprintQuestion, 'statement_en' | 'statement_voice' | 'question_en' | 'question_voice'>,
  opts: PlayStatementThenQuestionOptions,
): Promise<{ cancelled: boolean }> {
  const { playTrack, isCancelled, gapMs = SPRINT_FLOW_TIMING.shared.statementQuestionGapMs, onStatementPhase, onQuestionPhase } = opts;

  if (question.statement_en) {
    onStatementPhase?.();
    await playTrack(question.statement_en, question.statement_voice);
    if (isCancelled()) return { cancelled: true };
    await new Promise((r) => setTimeout(r, gapMs));
    if (isCancelled()) return { cancelled: true };
  }

  onQuestionPhase?.();
  if (question.question_en) {
    await playTrack(question.question_en, question.question_voice);
    if (isCancelled()) return { cancelled: true };
  }

  return { cancelled: false };
}

/**
 * Drill/Sprint両プレイヤーの `stopAllAudio` に共通する部分
 * （トラック停止→音声合成キャンセル→マイク停止→ディレイ後にAudioSessionをplaybackへ復帰）のみを抽出したフック。
 * 各プレイヤー固有の状態リセット（isPlayingXxxSequence、isAwaitingRecording等）は
 * このフックの戻り値を呼んだ後、呼び出し側で個別に行う。
 */
export function useStopAllAudioCore(stopTrack: () => void, stopListening: () => void) {
  return useCallback(() => {
    stopTrack();
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    stopListening();

    // 🚀 iOS WebKitデッドロック防止:
    // マイクの切断完了（物理解放）までの遅延を待つため、ディレイの後にセッションを戻す
    setTimeout(() => {
      setAudioSessionPlayback();
    }, SPRINT_FLOW_TIMING.shared.micReleaseSessionRestoreMs);
  }, [stopTrack, stopListening]);
}

/**
 * Drill/Sprint両プレイヤーで共通の「フルスクリーン固定＋アンマウント時クリーンアップ」ライフサイクル。
 * マウント中は body のスクロールを固定し、アンマウント時に全音声を停止してAudioSessionを
 * playbackへ確実に復帰させる（stopAllAudio 自身が isRecording リセットやマイク停止を内包しているため、
 * ここで重複して行う必要はない）。
 */
/**
 * Drill/Sprint両プレイヤーで共通の「非同期音声フローのキャンセルトークン」管理フック。
 * 世代カウンタ（flowIdRef）を各プレイヤーが個別に useRef(0) で持ち、
 * stopAllAudio 内で `+= 1` して割り込みを表現し、await の直後に
 * `flowIdRef.current !== currentFlowId` で古い実行を打ち切る、という
 * 全く同じパターンがコピペされていたため、ref生成とinvalidate操作のみを集約する。
 * 比較（isCancelled等）は各呼び出し側の既存コードのまま `flowIdRef.current` を直接参照でよい。
 */
export function useFlowGuard() {
  const flowIdRef = useRef<number>(0);

  const invalidateFlow = useCallback(() => {
    flowIdRef.current += 1;
  }, []);

  return { flowIdRef, invalidateFlow };
}

export function useFullscreenAudioLifecycle(stopAllAudio: () => void) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
      stopAllAudio();
      // 🚀 アンマウント（終了）時に 'playback' に戻してマイクを完全に解放
      setAudioSessionPlayback();
    };
  }, [stopAllAudio]);
}
