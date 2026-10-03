'use client';

import { useEffect, useRef, use, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSpeakingSession } from '@gabby/lib/audio/react/useSpeakingSession';
import { useSpeakingPlayer } from '@gabby/lib/audio/react/useSpeakingPlayer';
import { usePeriodicSync } from '@gabby/lib/hooks/usePeriodicSync';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { useExitConfirmFlow } from '@gabby/lib/hooks/useExitConfirmFlow';
import { logClientEvent } from '@gabby/lib/logger/actions';
import { getWordData, toggleFavorite, reportWordProgress } from '@/actions/wordAction';
import { FAVORITE_TOGGLE_NETWORK_ERROR, getFavoriteToggleErrorMessage } from '@/constants/favorites';
import { saveResumeContent, takeResumeContent } from '@/actions/contentAction';
import { useWordDrillStore } from '@/stores/useWordDrillStore';
import { WordResumeMetadata } from '@gabby/types/training';
import { getFeedbackConfig } from '@gabby/lib';

// Components
import { WordHeader } from './_components/WordHeader';
import { WordCard } from './_components/WordCard';
import { WordControls } from './_components/WordControls';
import { WordFeedback } from './_components/WordFeedback';
import { WordIndex } from './_components/WordIndex';
import { BookOpen, ArrowLeft, AlertCircle } from 'lucide-react';
import { PhraseItem } from '@gabby/types/word';
import { ContentLoading } from '@/components/common/ContentLoading';
import { AudioResumeBanner } from '@/components/common/AudioResumeBanner';
import { ImmersiveNotice, noticeActionClass } from '@/components/shell/ImmersiveNotice';
import { ImmersivePanel } from '@/components/shell/PageFrames';
import { cancelSpeech } from '@gabby/lib/speech/synthesis';

export default function WordTrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sectionId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  
  // 音声エンジン・録音・評価ロジック
  // 表示中ずっと発話セッションを借り、最初の発話以降は出力経路を切り替えない
  useSpeakingSession();
  // 再生・発話（単語帳・スプリント共通のプレイヤー）
  const {
    play,
    preload,
    listen,
    beginFlow,
    stopAll,
    finishListening,
    isListening,
    timeLeft,
    interruptions,
    unlock: unlockAudioContext,
    isPlaying: isAudioPlaying,
    playbackRate,
    changePlaybackRate,
    resumeStatus,
  } = useSpeakingPlayer({ decodeTimeoutMs: 1000, stopBeforeChime: true, urlResolution: 'sdk' });

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

        // クエリパラメータに resume=true がある場合、DBから最終学習位置を取り出す（再開した時点で再開情報は削除される）
        if (searchParams.get('resume') === 'true') {
          const resumeItemId = await takeResumeContent(sectionId);
          if (resumeItemId) {
            fetchedWords.some((w, wIdx) => {
              const pIdx = w.phrases.findIndex(p => p.phrase_id === resumeItemId);
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
   * 確認→ローディング表示→進捗同期→離脱、という流れはSprintプレイヤーと共通のためフック化
   */
  const handleBackToPrevious = useExitConfirmFlow({
    confirmTitle: "トレーニングを終了しますか？",
    confirmMessage: "前の画面に戻ります。",
    confirmVariant: 'info',
    setLoading,
    sync: syncProgressNow,
    onExit: () => router.back(),
  });

  /**
   * 音声が再生できない場合の共通ハンドラ
   * 代替読み上げ（TTSフォールバック）は行わず、ユーザーへの通知とサーバーログ記録のみ行う。
   * 音声ファイルは常に用意されている前提のため、発生時は運用側で把握できるようにする。
   */
  const handleAudioUnavailable = useCallback((phrase: PhraseItem, reason: string) => {
    showToast('音声を再生できません', 'error');
    logClientEvent({
      service: 'student',
      event: 'word:audio_playback_failed',
      message: `Phrase audio unavailable: ${phrase.phrase_id}`,
      payload: {
        sectionId,
        phraseId: phrase.phrase_id,
        wordId: phrase.word_id,
        audioPath: phrase.audio_path,
        ttsStatus: phrase.tts_status,
        reason,
      },
    }).catch(() => { /* ログ送信自体の失敗はユーザー体験に影響させない */ });
  }, [sectionId, showToast]);

  /**
   * 音声再生用統合ハンドラ
   */
  const handleGlobalSpeak = useCallback((phrase: PhraseItem) => {
    if (phrase.audio_path && phrase.tts_status === 1) {
      play(phrase.audio_path, {
        id: phrase.phrase_id,
        restart: true,
        onError: (err) => handleAudioUnavailable(phrase, err instanceof Error ? err.message : String(err)),
      });
    } else {
      handleAudioUnavailable(phrase, 'tts_not_ready');
    }
  }, [play, handleAudioUnavailable]);

  /**
   * ナビゲーション：次へ進む
   */
  const handleNext = useCallback(() => {
    cancelSpeech();
    if (isNavigating.current) return;

    isNavigating.current = true;
    const { isLast } = nextStep();
    if (isLast) {
      showToast("すべてのトレーニングが完了しました！", "success");
    }
    
    // ナビゲーションガードを長めに確保し、再レンダリングに伴うアンマウントの嵐をやり過ごす
    setTimeout(() => { isNavigating.current = false; }, 1000);
  }, [nextStep, showToast]);

  /**
   * ナビゲーション：前へ戻る
   */
  const handlePrev = useCallback(() => {
    cancelSpeech();
    if (isNavigating.current) return;

    isNavigating.current = true;
    prevStep(); 
    
    setTimeout(() => { isNavigating.current = false; }, 400);
  }, [prevStep]);

  /**
   * 音声認識の開始/停止
   */
  const handleVoiceCheck = async () => {
    // 発話中のタップは、その時点の評価で確定する
    if (isListening) { finishListening(); return; }
    if (!currentWord || !currentPhrase) return;

    // iOS WebKit 自動再生ロックの明示的な解除
    await unlockAudioContext();

    setFeedback(null);
    setAnalysis(null);

    // チャイムが鳴り終わってから認識を開始する。カードを切り替えた場合は中断され、結果は反映しない
    const result = await listen({
      targetText: currentPhrase.phrase_en,
      mainWords: [currentWord.word_en],
      signal: beginFlow(),
    });
    if (!result) return;
    setAnalysis(result);
    setFeedback(getFeedbackConfig(result.score));
    useWordDrillStore.getState().incrementAssessmentCount();
  };

  /**
   * お気に入り状態の同期
   */
  const handleToggleFavorite = async (phraseId: string, currentState: boolean) => {
    const nextState = !currentState;
    updatePhraseFavorite(phraseId, nextState);

    // 登録上限の超過・失敗は戻り値で返る
    const result = await toggleFavorite(phraseId, nextState).catch(() => FAVORITE_TOGGLE_NETWORK_ERROR);
    if (!result.ok) {
      updatePhraseFavorite(phraseId, currentState);
      showToast(getFavoriteToggleErrorMessage(result), 'error');
      return;
    }
    showToast(nextState ? 'お気に入りに追加しました' : 'お気に入りを解除しました', 'success');
  };

  /**
   * 💡 確実な離脱アクション2：学習進捗を保存してダッシュボードへ戻る
   */
  const handleSaveAndExit = async () => {
    if (!currentWord || !currentPhrase) return;
    const ok = await showConfirm("ブックマークして終了しますか？", "ホームの「続きから」で、この位置から再開できます。", { variant: 'warning', isModal: false });
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

      showToast("ブックマークしました", "success");
      router.push('/dashboard');
    } catch (e) {
      showToast("保存に失敗しました", "error");
    }
  };

  /**
   * カードの切り替え時は、前のカードの再生・発話を止める（前のカードの評価結果を反映させない）
   */
  useEffect(() => {
    return () => stopAll();
  }, [wordIdx, phraseIdx, stopAll]);

  /**
   * iOS の中断（画面が隠れた・通話等）では自動再生を止める。
   * 音声が出ない間に「再生が終わった」とみなされ、聞こえないままフレーズが進むのを防ぐ（再開は利用者の操作で行う）
   */
  useEffect(() => {
    if (interruptions > 0) useWordDrillStore.getState().toggleAutoPlay(false);
  }, [interruptions]);

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
      cancelSpeech();
    };
  }, [wordIdx, phraseIdx, isAutoPlaying, isListening, loading, currentPhrase, handleGlobalSpeak]);

  /**
   * 自動再生：次ステップへの遷移
   */
  useEffect(() => {
    const stillPlaying = isAudioPlaying !== null;
    if (!isAutoPlaying || isListening || stillPlaying || loading) return;

    const nextTimer = setTimeout(() => {
      const latestState = useWordDrillStore.getState();
      if (latestState.isAutoPlaying && !isNavigating.current) {
        handleNext();
      }
    }, 1500);

    return () => clearTimeout(nextTimer);
  }, [isAutoPlaying, isAudioPlaying, isListening, loading, handleNext]);

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
    <ImmersiveNotice
      tone="warning"
      icon={<AlertCircle size={28} />}
      title="この教材は利用できません"
      description="現在ご利用いただけないか、アクセスする権限がありません。"
      actions={
        <>
          <button type="button" onClick={() => router.push('/dashboard')} className={noticeActionClass()}>
            ホームに戻る
          </button>
          <button type="button" onClick={handleBackToPrevious} className={noticeActionClass('secondary')}>
            <ArrowLeft size={14} strokeWidth={2.5} />
            前の画面に戻る
          </button>
        </>
      }
    />
  );

  // 安全装置（words[0]はあるが何らかの理由で現在のインデックスが異常な場合）
  if (!currentWord || !currentPhrase) return null;

  // 3. メイン学習画面
  return (
    <>
      <ImmersivePanel as="main">
        
        <div className="flex-1 flex flex-col overflow-hidden p-4 pb-0">
          <WordHeader onBack={handleBackToPrevious} />
          
          <div className="flex-1 flex flex-col justify-center overflow-hidden">
            <WordCard onToggleFavorite={handleToggleFavorite} />
          </div>
        </div>

        <div className="px-6 pb-8 shrink-0">
          <WordControls 
            isListening={isListening}
            isPlaying={isAudioPlaying !== null}
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

        <AudioResumeBanner status={resumeStatus} onResume={() => { unlockAudioContext(); }} />
      </ImmersivePanel>

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
    </>
  );
}