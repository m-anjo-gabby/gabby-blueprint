'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SprintQuestion } from "@gabby/types/sprint";
import { QuestionCard } from "./shared/QuestionCard";
import { SprintPlayControls } from "./shared/SprintPlayControls";
import { X, ChevronLeft, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

// 🔌 単語帳と共通の音声・評価フックをインポート
import { useWebSpeech } from '@gabby/lib/hooks/useWebSpeech';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';

interface SprintDrillPlayerProps {
  questions: SprintQuestion[];
}

export const SprintDrillPlayer: React.FC<SprintDrillPlayerProps> = ({ questions = [] }) => {
  const router = useRouter();

  // ────────────────────────────────────────────────────────────
  // 🔌 1. 音声・評価用カスタムフックの初期化
  // ────────────────────────────────────────────────────────────
  const { 
    speak: ttsSpeak, 
    setSpeechRate: ttsSetRate, 
    startAssessment, 
    stopListening, 
    timeLeft, 
    isListening, 
    isSpeaking: isTtsSpeaking 
  } = useWebSpeech();

  const { 
    play: filePlay, 
    playbackRate, 
    changePlaybackRate, 
    isPlaying: filePlayingId 
  } = usePlayAudioSpeech();

  // 📦 状態管理 (State)
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  
  const totalQuestions = questions?.length || 0;
  const currentQuestion = questions?.[currentIndex];

  // 🔄 状態判定用のフラグ（現在なんらかの音声が流れているか）
  const isAudioPlaying = !!filePlayingId || isTtsSpeaking;

  // ────────────────────────────────────────────────────────────
  // 🔊 2. ハイブリッド連続音声再生コアロジック (Audio File & TTS Wrapper)
  // ────────────────────────────────────────────────────────────
  // 既存のネイティブ Audio の再生終了検知用リスナーを保持するRef
  const nativeAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopAllAudio = useCallback(() => {
    if (nativeAudioRef.current) {
      nativeAudioRef.current.pause();
      nativeAudioRef.current = null;
    }
    if (typeof window !== 'undefined') {
      window.speechSynthesis.cancel();
    }
  }, []);

  /**
   * 単一のテキストまたはオーディオファイルを再生し、完了したらPromiseを返す関数
   */
  const playSingleTrack = useCallback((text: string, audioPath: string | null): Promise<void> => {
    return new Promise((resolve) => {
      // パターンA: Supabaseのストレージに音声ファイルが存在する場合
      if (audioPath) {
        stopAllAudio();
        // usePlayAudioSpeech の内部 publicUrl 解決ロジックをシミュレートしつつ終了をハンドリング
        // ※ フック側の play を直接呼ぶと複数のコールバックチェーンが組めないため、ここで安全に生成
        const bucketUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${audioPath}`;
        const audio = new Audio(bucketUrl);
        audio.playbackRate = playbackRate;
        nativeAudioRef.current = audio;

        audio.onended = () => resolve();
        audio.onerror = () => {
          console.warn(`Audio file failed to load: ${audioPath}. Falling back to TTS.`);
          // ファイルが破損・エラーの場合は即座にTTS（パターンB）へ移行
          ttsSpeak(text, playbackRate);
          const checkTtsEnd = setInterval(() => {
            if (!window.speechSynthesis.speaking) {
              clearInterval(checkTtsEnd);
              resolve();
            }
          }, 100);
        };
        audio.play().catch(() => resolve());
      } else {
        // パターンB: 音声ファイルがない場合はブラウザの合成音声(TTS)で出力
        stopAllAudio();
        ttsSpeak(text, playbackRate);
        
        // Web Speech API の onend がブラウザの相性で不安定な場合のセーフティ監視
        const checkTtsEnd = setInterval(() => {
          if (!window.speechSynthesis.speaking) {
            clearInterval(checkTtsEnd);
            resolve();
          }
        }, 100);
      }
    });
  }, [playbackRate, ttsSpeak, stopAllAudio]);

  /**
   * 【最重要】初期表示時のシーケンシャル再生（ステートメント ➔ 問題文）
   */
  const playQuestionSequence = useCallback(async (question: SprintQuestion) => {
    if (!question) return;
    
    // 1. まずはステートメント文を再生
    if (question.statement) {
      await playSingleTrack(question.statement, question.statement_voice);
    }
    // 2. 完了後、少しの間（200ms）を空けて問題文を再生
    await new Promise(r => setTimeout(r, 200));
    await playSingleTrack(question.question, question.question_voice);
  }, [playSingleTrack]);

  // 🔋 速度変更時にTTS側のRefへも即座に通知を同期する
  const handleCycleRate = useCallback(() => {
    const rates = [1.0, 1.2, 1.5, 0.8];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    const targetRate = rates[nextIndex];
    
    changePlaybackRate(targetRate);
    ttsSetRate(targetRate);
  }, [playbackRate, changePlaybackRate, ttsSetRate]);

  // ────────────────────────────────────────────────────────────
  // ⚡ 3. 画面・カード遷移時の自動発火ライフサイクル
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentQuestion) return;

    // カードが切り替わったら、少しディレイを挟んで自動でステートメント→問題の順に再生開始
    const timer = setTimeout(() => {
      playQuestionSequence(currentQuestion);
    }, 300);

    return () => {
      clearTimeout(timer);
      stopAllAudio();
    };
  }, [currentIndex, currentQuestion, playQuestionSequence, stopAllAudio]);

  // 🛡️ ハイドレーション＆スクロール防止用イフェクト
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
      stopAllAudio();
    };
  }, [stopAllAudio]);

  // ────────────────────────────────────────────────────────────
  // 🛡️ 4. 早期リターン (Early Return)
  // ────────────────────────────────────────────────────────────
  if (!questions || totalQuestions === 0 || !currentQuestion) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl w-full max-w-md text-center space-y-4">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Preparing Questions</h2>
          <button onClick={() => router.push('/training')} className="w-full h-14 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest">
            Go to Training List
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  // 🎮 5. 操作ハンドラー群 (Handlers)
  // ────────────────────────────────────────────────────────────
  /**
   * 解答表示ボタン（Reveal）タップ時
   */
  const handleReveal = () => {
    setIsRevealed(true);
    // 解答表示と同時に、即座に解答文の音声を再生（ファイル優先 ➔ TTS）
    playSingleTrack(currentQuestion.answer_sentence_yes, currentQuestion.answer_sentence_yes_voice);
  };

  /**
   * スピーカーボタン（Listen）手動タップ時
   */
  const handleManualPlayAudio = () => {
    if (isRevealed) {
      // 解答オープン状態なら解答文を再生
      playSingleTrack(currentQuestion.answer_sentence_yes, currentQuestion.answer_sentence_yes_voice);
    } else {
      // 未オープン状態なら、初期表示時と同じく「ステートメント→問題」のフルコンボを再再生
      playQuestionSequence(currentQuestion);
    }
  };

  const handleStartRecord = () => {
    setIsRecording(true);
    // 発音評価の対象テキストと判定用ワードリストを設定してスタート
    const targetText = isRevealed ? currentQuestion.answer_sentence_yes : currentQuestion.question;
    const cleanWords = targetText.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"").split(" ");
    
    startAssessment(targetText, cleanWords, (result) => {
      console.log("発音判定スコア:", result.score);
      // 必要に応じてここでスコアをStateに保存しUIにフィードバック可能
    });
  };

  const handleStopRecord = () => {
    setIsRecording(false);
    stopListening();
  };

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      stopAllAudio();
      setIsRevealed(false);
      setIsRecording(false);
      setCurrentIndex(prev => prev + 1);
    } else {
      alert("すべてのドリルが完了しました！お疲れ様でした。");
      router.push('/training');
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      stopAllAudio();
      setIsRevealed(false);
      setIsRecording(false);
      setCurrentIndex(prev => prev - 1);
    } else {
      router.push('/training');
    }
  };

  const progress = totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0;
  const current = currentIndex + 1;

  // ────────────────────────────────────────────────────────────
  // 🎨 6. View 層
  // ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50 flex items-center justify-center p-2 overflow-hidden touch-none select-none">
      <main className="bg-white text-slate-900 shadow-2xl border border-slate-100 w-full max-w-2xl h-full max-h-[95vh] rounded-[40px] flex flex-col relative overflow-hidden">
        
        {/* 🔼 上部：単語帳同期ヘッダー */}
        <div className="shrink-0 pt-4 w-full overflow-hidden px-4">
          <div className="flex items-center justify-between gap-2 h-12 px-2">
            <button onClick={handleBack} className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-white text-slate-400 border border-slate-100 shadow-sm hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all">
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
            <div className="flex-1 min-w-0 flex flex-col items-center">
              <div className="mb-2 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100/80">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none block whitespace-nowrap">Drill Mode</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 w-full">
                <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none truncate">Question Card</h1>
              </div>
            </div>
            <button onClick={() => router.push('/training')} className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-white text-slate-400 border border-slate-100 shadow-sm hover:bg-slate-50 hover:text-indigo-600 active:scale-95 transition-all">
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>

          <div className="mt-2 px-6 pb-2">
            <div className="flex justify-between items-end mb-1.5 px-0.5">
              <div className="flex items-baseline gap-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Card</span>
                <span className="text-[11px] font-black text-indigo-600 ml-1 tabular-nums">{current}</span>
                <span className="text-[9px] font-bold text-slate-300">/</span>
                <span className="text-[10px] font-bold text-slate-400 tabular-nums">{totalQuestions}</span>
              </div>
              <span className="text-[10px] font-black text-slate-400 tabular-nums">{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner relative">
              <div className="absolute top-0 left-0 h-full bg-indigo-600 transition-all duration-500 ease-out rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        {/* 🎴 中央：メイン教材カードセクション */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
          <div className="w-full max-w-md mx-auto">
            <QuestionCard question={currentQuestion} mode="drill" isRevealed={isRevealed} />
          </div>
        </div>

        {/* 🎮 下部：コントロールセクション（音声・評価ステートを完全注入） */}
        <div className="px-6 pb-8 shrink-0">
          <div className="w-full max-w-md mx-auto">
            <SprintPlayControls 
              mode="drill"
              isRevealed={isRevealed}
              isRecording={isRecording}
              onReveal={handleReveal}
              onNext={handleNext}
              onPlayAudio={handleManualPlayAudio}
              onStartRecord={handleStartRecord}
              onStopRecord={handleStopRecord}
              hasAudio={true} // TTSがあるため常に再生可能
              isPlaying={isAudioPlaying} // 再生中のインジケーター用
              playbackRate={playbackRate}
              onChangePlaybackRate={handleCycleRate}
              timeLeft={timeLeft}
            />
          </div>
        </div>

      </main>
    </div>
  );
};