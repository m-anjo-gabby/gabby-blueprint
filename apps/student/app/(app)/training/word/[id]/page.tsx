'use client';

import { useEffect, useRef, use, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWebSpeech } from '@gabby/lib/hooks/useWebSpeech';
import { usePeriodicSync } from '@gabby/lib/hooks/usePeriodicSync';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { getWordData, toggleFavorite, reportWordProgress } from '@/actions/wordAction';
import { getLatestResumeContent, saveResumeContent } from '@/actions/contentAction';
import { useResumeStore } from '@/stores/useResumeStore';
import { usePhraseStore } from '@/stores/usePhraseStore';
import { useWordDrillStore } from '@/stores/useWordDrillStore';
import { WordResumeMetadata } from '@gabby/types/training';
import { FeedbackConfig } from '@gabby/types/speechAssessment';

// Components
import { WordHeader } from './_components/WordHeader';
import { WordCard } from './_components/WordCard';
import { WordControls } from './_components/WordControls';
import { WordFeedback } from './_components/WordFeedback';
import { WordIndex } from './_components/WordIndex';
import { BookOpen, ArrowLeft, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { PhraseItem } from '@gabby/types/word';
import { ContentLoading } from '@/components/common/ContentLoading';

/**
 * 発話スコアに基づいたフィードバックUIの設定を返す
 */
const getFeedbackConfig = (score: number): FeedbackConfig => {
  if (score >= 0.90) return { fill: '#10B981', tagText: 'Excellent' };
  if (score >= 0.80) return { fill: '#3B82F6', tagText: 'Great' };
  if (score >= 0.60) return { fill: '#F59E0B', tagText: 'Good' };
  if (score >= 0.30) return { fill: '#F97316', tagText: 'Fair' };
  return { fill: '#EF4444', tagText: 'Poor' };
};

export default function WordTrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sectionId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  
  // 音声エンジン・録音・評価ロジック
  const { speak, setSpeechRate, startAssessment, stopListening, isListening, isSpeaking, timeLeft } = useWebSpeech();
  
  // 統合された音声再生フック（playChime, unlockAudioContextを追加抽出）
  const { 
    play, 
    preload, 
    playChime, 
    unlockAudioContext, 
    isPlaying: isAudioPlaying, 
    playbackRate, 
    changePlaybackRate 
  } = usePlayAudioSpeech();

  // ドリル状態管理（Zustand）
  const { 
    words, wordIdx, phraseIdx, isAutoPlaying, showIndex, 
    feedback, analysis, loading,
    initDrill, setFeedback, setAnalysis, setLoading, nextStep, prevStep,
    toggleAutoPlay, jumpTo, updatePhraseFavorite, reset,
  } = useWordDrillStore();

  // 初期化管理と二重遷移防止用Ref
  const isInitialized = useRef<string | null>(null);
  const isNavigating = useRef(false);

  // sectionIdの最新値を保持するRef。同期処理（useEffect内）で最新のIDを参照するために使用。
  const sectionIdRef = useRef(sectionId);
  useEffect(() => {
    sectionIdRef.current = sectionId;
  }, [sectionId]);

  const currentWord = words[wordIdx];
  const currentPhrase = currentWord?.phrases[phraseIdx];

  /**
   * 教材データの読み込みとレジューム（再開）処理
   */
  useEffect(() => {
    if (isInitialized.current === sectionId) return;
    isInitialized.current = sectionId;

    async function init() {
      setLoading(true); 
      reset(); // 前のセッション情報をクリア

      try {
        const { words: fetchedWords, contentName: name, cefr } = await getWordData(sectionId);
        
        let startW = 0;
        let startP = 0;
        let isResumed = false;

        // クエリパラメータに resume=true がある場合、DBから最終学習位置を取得
        if (searchParams.get('resume') === 'true') {
          const resume = await getLatestResumeContent();
          if (resume && resume.content_id === sectionId) {
            fetchedWords.some((w, wIdx) => {
              const pIdx = w.phrases.findIndex(p => p.phrase_id === resume.item_id);
              if (pIdx !== -1) { 
                startW = wIdx; 
                startP = pIdx; 
                isResumed = true;
                return true; 
              }
              return false;
            });
          }
        }

        initDrill(fetchedWords, name, cefr, startW, startP);
        
        // 教材を開いた瞬間の先行カウント（1件分）を即座に同期して、不意の離脱に備える
        await syncProgressNow();

        if (isResumed) showToast("続きから再開しました", "success");
      } catch (e) {
        showToast("データの読み込みに失敗しました", "error");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [sectionId, searchParams, showToast, initDrill, setLoading, reset]);

  /**
   * 手動同期関数
   * 溜まっている進捗があればサーバーへ報告し、ストアをクリアする
   */
  const syncProgressNow = useCallback(async () => {
    const { wordCount, phraseCount, assessmentCount } = useWordDrillStore.getState().clearPendingCounts();
    if (wordCount > 0 || phraseCount > 0 || assessmentCount > 0) {
      await reportWordProgress(sectionIdRef.current, wordCount, phraseCount, assessmentCount);
    }
  }, []);

  /**
   * 5分ごとの定期自動保存
   * 画面を開いている限り、5分ごとにプールされた進捗をバックグラウンドで安全に同期します。
   */
  usePeriodicSync(syncProgressNow, 5 * 60 * 1000);

  /**
   * 前の画面に戻るボタン用のハンドラ
   */
  const handleBackToPrevious = async () => {
    const ok = await showConfirm("トレーニングを終了しますか？", "前の画面に戻ります。", { 
      variant: 'info', 
      isModal: false 
    });
    if (!ok) return;

    setLoading(true);
    try {
      // 戻る前に溜まっている進捗を確実にフラッシュ
      await syncProgressNow();
    } catch (e) {
      console.error(e);
    }
    router.back();
  };

  /**
   * 再生速度の同期
   */
  useEffect(() => {
    setSpeechRate(playbackRate);
  }, [playbackRate, setSpeechRate]);

  /**
   * 音声再生用統合ハンドラ
   */
  const handleGlobalSpeak = useCallback((phrase: PhraseItem) => {
    if (phrase.audio_path && phrase.tts_status === 1) {
      play(phrase.audio_path, phrase.phrase_id, { restart: true });
    } else {
      speak(phrase.phrase_en, playbackRate);
    }
  }, [play, speak, playbackRate]);

  /**
   * ナビゲーション：次へ進む
   */
  const handleNext = useCallback(() => {
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    if (isNavigating.current) return;

    isNavigating.current = true;
    const { isLast } = nextStep();
    if (isLast) {
      showToast("全ての学習が完了しました！", "success");
    }
    
    // ナビゲーションガードを長めに確保し、再レンダリングに伴うアンマウントの嵐をやり過ごす
    setTimeout(() => { isNavigating.current = false; }, 1000);
  }, [nextStep, showToast]);

  /**
   * ナビゲーション：前へ戻る
   */
  const handlePrev = useCallback(() => {
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    if (isNavigating.current) return;

    isNavigating.current = true;
    prevStep(); 
    
    setTimeout(() => { isNavigating.current = false; }, 400);
  }, [prevStep]);

  /**
   * 音声認識の開始/停止
   */
  const handleVoiceCheck = async () => {
    if (isListening) { stopListening(); return; }
    if (!currentWord || !currentPhrase) return;

    // iOS WebKit 自動再生ロックの明示的な解除
    await unlockAudioContext();

    setFeedback(null);
    setAnalysis(null);

    // suppressAudioSessionSwitch: true を渡してフック間のオーディオ奪い合いを防ぐ
    startAssessment(
      currentPhrase.phrase_en, 
      [currentWord.word_en], 
      (result) => {
        setAnalysis(result);
        setFeedback(getFeedbackConfig(result.score));
        useWordDrillStore.getState().incrementAssessmentCount();
      },
      {
        suppressAudioSessionSwitch: true,
        // 🚀 実際にブラウザのマイクが開いた（録音準備完了）タイミングでチャイムを鳴らす
        onRecognitionStart: () => {
          playChime();
        }
      }
    );
  };

  /**
   * お気に入り状態の同期
   */
  const handleToggleFavorite = async (phraseId: string, currentState: boolean) => {
    const nextState = !currentState;
    updatePhraseFavorite(phraseId, nextState);

    try {
      await toggleFavorite(phraseId, nextState);
      usePhraseStore.getState().clearCache();
      showToast(nextState ? 'お気に入りに追加しました' : 'お気に入りを解除しました', 'success');
    } catch (e) {
      updatePhraseFavorite(phraseId, currentState);
      showToast("更新に失敗しました", "error");
    }
  };

  /**
   * 💡 確実な離脱アクション2：学習進捗を保存してダッシュボードへ戻る
   */
  const handleSaveAndExit = async () => {
    if (!currentWord || !currentPhrase) return;
    const ok = await showConfirm("Bookmark?", "進捗を保存してダッシュボードに戻ります。", { variant: 'warning', isModal: false });
    if (!ok) return;

    const metadata: WordResumeMetadata = {
      type: 'word',
      phrase_id: currentPhrase.phrase_id,
      word_id: currentWord.word_id,
      last_index: wordIdx,
      display: {
        progress_percent: Math.round(((wordIdx + 1) / words.length) * 100),
        position_text: `Word ${wordIdx + 1} / ${words.length}`,
        last_unit_name: currentWord.word_en
      }
    };

    try {
      await saveResumeContent(sectionId, currentPhrase.phrase_id, metadata);
      
      // 💡 ブックマークして終了時は、即座に進捗の溜まりを同期
      await syncProgressNow();

      await useResumeStore.getState().fetchResume(true);
      showToast("ブックマークしました", "success");
      router.push('/dashboard');
    } catch (e) {
      showToast("保存に失敗しました", "error");
    }
  };

  /**
   * 自動再生：発話トリガー
   */
  useEffect(() => {
    if (!isAutoPlaying || !currentPhrase || isListening || loading) return;

    const t = setTimeout(() => {
      handleGlobalSpeak(currentPhrase);
    }, 600); 

    return () => {
      clearTimeout(t);
      if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    };
  }, [wordIdx, phraseIdx, isAutoPlaying, isListening, loading, currentPhrase, handleGlobalSpeak]);

  /**
   * 自動再生：次ステップへの遷移
   */
  useEffect(() => {
    const stillSpeaking = isSpeaking || (isAudioPlaying !== null);
    if (!isAutoPlaying || isListening || stillSpeaking || loading) return;

    const nextTimer = setTimeout(() => {
      const latestState = useWordDrillStore.getState();
      if (latestState.isAutoPlaying && !isNavigating.current) {
        handleNext();
      }
    }, 1500); 

    return () => clearTimeout(nextTimer);
  }, [isAutoPlaying, isSpeaking, isAudioPlaying, isListening, loading, handleNext]);

  /**
   * 自動再生モードの切り替え
   */
  const handleToggleAutoPlay = async () => {
    if (!isAutoPlaying) {
      const ok = await showConfirm("Start Auto Play?", "自動再生を開始しますか？", { variant: 'info', isModal: false });
      if (!ok) return;
      // ユーザーインタラクション時にAudioContextのロックを強制解除
      await unlockAudioContext();
    }
    toggleAutoPlay();
  };

  /**
   * 次の音声のプリロード
   */
  useEffect(() => {
    const nextPIdx = phraseIdx + 1;
    const nextWIdx = wordIdx;
    let nextPhrase = null;

    if (currentWord?.phrases[nextPIdx]) {
      nextPhrase = currentWord.phrases[nextPIdx];
    } else if (words[nextWIdx + 1]?.phrases[0]) {
      nextPhrase = words[nextWIdx + 1].phrases[0];
    }

    if (nextPhrase?.audio_path && nextPhrase.tts_status === 1) {
      const idleId = (window.requestIdleCallback || ((cb) => setTimeout(cb, 1)))(() => {
        preload(nextPhrase.audio_path!);
      });
      return () => {
        if (window.cancelIdleCallback) window.cancelIdleCallback(idleId as number);
        else clearTimeout(idleId as number);
      };
    }
  }, [wordIdx, phraseIdx, words, currentWord, preload]);

  // --- View 層 ---

  // 1. ロード中画面
  if (loading) {
    return (
      <ContentLoading 
        title="Preparing your session" 
        subtitle="教材データを読み込んでいます..." 
      />
    );
  }

  // 2. エンプティステート：コンテンツが存在しない場合
  if (words.length === 0) return (
    <div className="fixed inset-0 bg-slate-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl w-full max-w-sm text-center"
      >
        <div className="w-20 h-20 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <AlertCircle size={40} className="text-amber-500" />
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-2">Unavailable</h2>
        <p className="text-slate-500 text-[13px] font-medium leading-relaxed mb-8 px-4">
          この教材は現在ご利用いただけないか、<br/>
          アクセスする権限がありません。
        </p>
        
        <div className="space-y-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full h-14 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-indigo-100"
          >
            Go to Dashboard
          </button>
          
          <button
            onClick={handleBackToPrevious}
            className="w-full h-12 bg-transparent text-slate-400 rounded-2xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:opacity-60"
          >
            <ArrowLeft size={14} strokeWidth={3} />
            Back to previous page
          </button>
        </div>
      </motion.div>
    </div>
  );

  // 安全装置（words[0]はあるが何らかの理由で現在のインデックスが異常な場合）
  if (!currentWord || !currentPhrase) return null;

  // 3. メイン学習画面
  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50 flex items-center justify-center p-2 overflow-hidden touch-none selection:bg-indigo-100">
      
      <main className="bg-white text-slate-900 shadow-2xl border border-slate-100 w-full max-w-2xl h-full max-h-[95vh] rounded-[40px] flex flex-col relative overflow-hidden">
        
        <div className="flex-1 flex flex-col overflow-hidden p-4 pb-0">
          <WordHeader onBack={handleBackToPrevious} />
          
          <div className="flex-1 flex flex-col justify-center overflow-hidden">
            <WordCard onToggleFavorite={handleToggleFavorite} />
          </div>
        </div>

        <div className="px-6 pb-8 shrink-0">
          <WordControls 
            isListening={isListening}
            isPlaying={isSpeaking || (isAudioPlaying !== null)}
            timeLeft={timeLeft}
            playbackRate={playbackRate}
            onChangePlaybackRate={changePlaybackRate}
            onNext={handleNext}
            onPrev={handlePrev}
            onSaveResume={handleSaveAndExit}
            onToggleAutoPlay={handleToggleAutoPlay}
            onSpeak={() => handleGlobalSpeak(currentPhrase)}
            onVoiceCheck={handleVoiceCheck}
          />
        </div>

        <WordFeedback feedback={feedback} analysis={analysis} onClose={() => setFeedback(null)} />
        <WordIndex isOpen={showIndex} onSelect={(idx) => jumpTo(idx, 0)} />
      </main>

      <style jsx global>{`
        :root {
          --removed-body-scroll-bar-size: 0px !important;
        }
        body {
          padding-right: 0px !important;
          overflow: hidden !important;
          position: fixed;
          width: 100%;
          height: 100%;
        }
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
}