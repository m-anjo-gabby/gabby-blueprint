'use client';

import { useEffect, useRef, use, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWebSpeech } from '@/hooks/useWebSpeech';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { getWordData, toggleFavorite } from '@/actions/wordAction';
import { getLatestResumeContent, saveResumeContent } from '@/actions/contentAction';
import { useResumeStore } from '@/stores/useResumeStore';
import { usePhraseStore } from '@/stores/usePhraseStore';
import { useWordDrillStore } from '@/stores/useWordDrillStore';
import { WordResumeMetadata } from '@/types/training';
import { FeedbackConfig } from '@/types/wordDrill';

// Components
import { WordHeader } from './_components/WordHeader';
import { WordCard } from './_components/WordCard';
import { WordControls } from './_components/WordControls';
import { WordFeedback } from './_components/WordFeedback';
import { WordIndex } from './_components/WordIndex';
import { BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { usePlayAudioSpeech } from '@/hooks/usePlayAudioSpeech';
import { PhraseItem } from '@/types/word';

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
  // 音声再生フック
  const { play, preload, isPlaying: isAudioPlaying, playbackRate, changePlaybackRate } = usePlayAudioSpeech();

  // ドリル状態管理（Zustand）
  const { 
    words, wordIdx, phraseIdx, isAutoPlaying, showIndex, 
    feedback, analysis, loading,
    initDrill, setFeedback, setAnalysis, setLoading, nextStep, prevStep,
    toggleAutoPlay, jumpTo, updatePhraseFavorite, reset 
  } = useWordDrillStore();

  // 初期化管理と二重遷移防止用Ref
  const isInitialized = useRef<string | null>(null);
  const isNavigating = useRef(false);

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
        const { words: fetchedWords, contentName: name } = await getWordData(sectionId);
        
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

        initDrill(fetchedWords, name, startW, startP);
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
   * 再生速度の同期
   * usePlayAudioSpeech側の速度をマスターとし、WebSpeech側にも反映させる
   */
  useEffect(() => {
    setSpeechRate(playbackRate);
  }, [playbackRate, setSpeechRate]);

  /**
   * 音声再生用統合ハンドラ
   */
  const handleGlobalSpeak = useCallback((phrase: PhraseItem) => {
    // 生成済み音声ファイルがあれば優先
    if (phrase.audio_path && phrase.tts_status === 1) {
      play(phrase.audio_path, phrase.phrase_id, { restart: true });
    } else {
      // フォールバック：ブラウザTTS（現在の速度を反映）
      speak(phrase.phrase_en, playbackRate);
    }
  }, [play, speak, playbackRate]);

  /**
   * ナビゲーション：次へ進む
   * 発話の中断とダブルクリック防止を制御
   */
  const handleNext = useCallback(() => {
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    if (isNavigating.current) return;

    isNavigating.current = true;
    const { isLast } = nextStep();
    if (isLast) showToast("全ての学習が完了しました！", "success");
    
    // 遷移アニメーション時間を考慮したインターバル
    setTimeout(() => { isNavigating.current = false; }, 400);
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
   * 音声認識の開始/停止とAI評価の実行
   */
  const handleVoiceCheck = () => {
    if (isListening) { stopListening(); return; }
    if (!currentWord || !currentPhrase) return;

    setFeedback(null);
    setAnalysis(null);

    // 単語ターゲットを含めた発話評価を開始
    startAssessment(currentPhrase.phrase_en, [currentWord.word_en], (result) => {
      setAnalysis(result);
      setFeedback(getFeedbackConfig(result.score));
    });
  };

  /**
   * お気に入り状態の同期（楽観的UI更新）
   */
  const handleToggleFavorite = async (phraseId: string, currentState: boolean) => {
    const nextState = !currentState;
    updatePhraseFavorite(phraseId, nextState); // 先に表示を更新

    try {
      await toggleFavorite(phraseId, nextState);
      usePhraseStore.getState().clearCache();
      showToast(nextState ? 'お気に入りに追加しました' : 'お気に入りを解除しました', 'success');
    } catch (e) {
      updatePhraseFavorite(phraseId, currentState); // 失敗時にロールバック
      showToast("更新に失敗しました", "error");
    }
  };

  /**
   * 学習進捗を保存してダッシュボードへ戻る
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
      await useResumeStore.getState().fetchResume(true);
      showToast("ブックマークしました", "success");
      router.push('/student/dashboard');
    } catch (e) {
      showToast("保存に失敗しました", "error");
    }
  };

  /**
   * 自動再生：発話トリガー
   * カードが切り替わった後、少し間を置いて英語を読み上げる
   */
  useEffect(() => {
    if (!isAutoPlaying || !currentPhrase || isListening || loading) return;

    const t = setTimeout(() => {
      handleGlobalSpeak(currentPhrase); // 統合ハンドラを使用
    }, 600); 

    return () => {
      clearTimeout(t);
      // ブラウザTTSとAudioPlayerの両方をケア
      if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    };
  }, [wordIdx, phraseIdx, isAutoPlaying, isListening, loading, currentPhrase, handleGlobalSpeak]);

  /**
   * 自動再生：次ステップへの遷移
   * 読み上げ完了（isSpeaking or isAudioPlaying が false になる）を待機
   */
  useEffect(() => {
    // どちらかが再生中なら待機
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
    }
    toggleAutoPlay();
  };

  /**
   * 次の音声のプリロード（先読み）
   */
  useEffect(() => {
    // 次のインデックスを計算
    const nextPIdx = phraseIdx + 1;
    const nextWIdx = wordIdx;
    
    let nextPhrase = null;

    // 同じ単語内の次のフレーズがあるか
    if (currentWord?.phrases[nextPIdx]) {
      nextPhrase = currentWord.phrases[nextPIdx];
    } 
    // 次の単語の最初のフレーズがあるか
    else if (words[nextWIdx + 1]?.phrases[0]) {
      nextPhrase = words[nextWIdx + 1].phrases[0];
    }

    // プリロード実行
    if (nextPhrase?.audio_path && nextPhrase.tts_status === 1) {
      // 画面のメイン処理を邪魔しないよう、少し遅らせて実行（Safari互換フォールバック付き）
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

  // ロード中画面
  if (loading) return (
    <div className="fixed inset-0 bg-[#f5f5f7] flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-8">
        <div className="relative w-20 h-20 mx-auto">
          <div className="absolute inset-0 border-4 border-indigo-100 rounded-2xl" />
          <div className="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-2xl animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-indigo-600">
            <BookOpen size={32} className="animate-pulse" />
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Preparing your session</h2>
          <div className="w-48 h-1 bg-slate-200 rounded-full overflow-hidden mx-auto mt-4">
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              className="w-full h-full bg-indigo-600"
            />
          </div>
        </div>
      </div>
    </div>
  );

  if (!currentWord || !currentPhrase) return null;

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-50 flex items-center justify-center p-2 overflow-hidden touch-none selection:bg-indigo-100">
      
      {/* メイン・コンテナ：iPhoneでの操作性を考慮し高さ制限と角丸を適用 */}
      <main className="bg-white text-slate-900 shadow-2xl border border-slate-100 w-full max-w-2xl h-full max-h-[95vh] rounded-[40px] flex flex-col relative overflow-hidden">
        
        {/* コンテンツエリア：WordControlsに高さを譲るため flex-col */}
        <div className="flex-1 flex flex-col overflow-hidden p-4 pb-0">
          <WordHeader />
          
          <div className="flex-1 flex flex-col justify-center overflow-hidden">
            <WordCard onToggleFavorite={handleToggleFavorite} />
          </div>
        </div>

        {/* コントロールエリア：最下部に固定 */}
        <div className="px-6 pb-8 shrink-0">
          <WordControls 
            isListening={isListening}
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

        {/* Portals: Overlay components */}
        <WordFeedback feedback={feedback} analysis={analysis} onClose={() => setFeedback(null)} />
        <WordIndex isOpen={showIndex} onSelect={(idx) => jumpTo(idx, 0)} />
      </main>

      {/* グローバルスタイル：スクロールの無効化と3Dカード用設定 */}
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