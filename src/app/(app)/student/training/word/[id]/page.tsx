'use client';

import { useEffect, useRef, use, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useVoice } from '@/hooks/useVoice';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { getWordData, toggleFavorite } from '@/actions/wordAction';
import { getLatestResumeContent, saveResumeContent } from '@/actions/contentAction';
import { useResumeStore } from '@/stores/useResumeStore';
import { usePhraseStore } from '@/stores/usePhraseStore';
import { useWordDrillStore } from '@/stores/useWordDrillStore';
import { WordResumeMetadata } from '@/types/training';
import { FeedbackConfig } from '@/types/wordDrill';

// 子コンポーネント
import { DrillHeader } from './_components/DrillHeader';
import { DrillCard } from './_components/DrillCard';
import { DrillControls } from './_components/DrillControls';
import { DrillFeedback } from './_components/DrillFeedback';
import { DrillIndex } from './_components/DrillIndex';
import { BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';

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
  
  const { speak, startEvaluation, stopListening, isListening, isSpeaking, timeLeft } = useVoice();

  // --- 1. Storeから状態とアクションを抽出 ---
  const { 
    words, wordIdx, phraseIdx, isAutoPlaying, showIndex, 
    feedback, analysis, loading,
    initDrill, setFeedback, setAnalysis, setLoading, nextStep, 
    toggleAutoPlay, jumpTo, updatePhraseFavorite, reset 
  } = useWordDrillStore();

  // sectionIdを保持できるように型を指定 (string | null)
  const isInitialized = useRef<string | null>(null);
  const isNextProcessing = useRef(false);

  const currentWord = words[wordIdx];
  const currentPhrase = currentWord?.phrases[phraseIdx];

  // --- 2. データ初期化ロジック (教材切り替え時のチラつきを完全に防止) ---
  useEffect(() => {
    // 現在保持しているIDと異なる（＝別の教材を開いた）場合のみ実行
    if (isInitialized.current === sectionId) return;
    isInitialized.current = sectionId;

    async function init() {
      // A. 開始直後にローディングをONにし、既存の古いデータをリセットする
      setLoading(true); 
      reset(); // これで前の教材のインデックスやフィードバックがクリアされる

      try {
        // 1. データを取得
        const { words: fetchedWords, contentName: name } = await getWordData(sectionId);
        
        let startW = 0;
        let startP = 0;
        let isResumed = false;

        // 2. ブックマークからの再開確認
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

        // 3. Storeを初期化 (新しいデータをセット)
        initDrill(fetchedWords, name, startW, startP);

        if (isResumed) {
          showToast("続きから再開しました", "success");
        }
      } catch (e) {
        showToast("データの読み込みに失敗しました", "error");
      } finally {
        // 4. データセットが完了してからローディングを解除
        setLoading(false);
      }
    }
    init();
  }, [sectionId, searchParams, showToast, initDrill, setLoading, reset]);

  // --- 3. ナビゲーション (useCallbackでメモ化) ---
  const handleNext = useCallback(() => {
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    isNextProcessing.current = true;
    const { isLast } = nextStep();
    if (isLast) showToast("全ての学習が完了しました！", "success");
    setTimeout(() => { isNextProcessing.current = false; }, 400);
  }, [nextStep, showToast]);

  // --- 4. 音声認識・評価 ---
  const handleVoiceCheck = () => {
    if (isListening) { stopListening(); return; }
    if (!currentWord || !currentPhrase) return;
    setFeedback(null);
    setAnalysis(null);
    startEvaluation(currentPhrase.phrase_en, [currentWord.word_en], (result) => {
      setAnalysis(result);
      setFeedback(getFeedbackConfig(result.score));
    });
  };

  // --- 5. お気に入り更新 ---
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

  // --- 6. 進捗保存して終了 ---
  const handleSaveAndExit = async () => {
    if (!currentWord || !currentPhrase) return;
    const ok = await showConfirm("終了しますか？", "進捗を保存してダッシュボードに戻ります。");
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

  // --- 7. 自動再生ロジック (発話と遷移を分離) ---

  // A. 発話：インデックス変更時に発火
  useEffect(() => {
    if (!isAutoPlaying || !currentPhrase || isListening || loading) return;

    const t = setTimeout(() => {
      speak(currentPhrase.phrase_en);
    }, 600); 

    return () => {
      clearTimeout(t);
      if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    };
  }, [wordIdx, phraseIdx, isAutoPlaying, isListening, loading, currentPhrase, speak]); 

  // B. 次へ：発話完了から1.5秒後に実行
  useEffect(() => {
    if (!isAutoPlaying || isListening || isSpeaking || loading) return;

    const nextTimer = setTimeout(() => {
      const latestState = useWordDrillStore.getState();
      if (latestState.isAutoPlaying && !isNextProcessing.current) {
        handleNext();
      }
    }, 1500); 

    return () => clearTimeout(nextTimer);
  }, [isAutoPlaying, isSpeaking, isListening, loading, handleNext]);

  const handleToggleAutoPlay = async () => {
    if (!isAutoPlaying) {
      const ok = await showConfirm("Start Auto Play?", "自動再生を開始しますか？", { variant: 'info', isModal: false });
      if (!ok) return;
    }
    toggleAutoPlay();
  };

  // --- 8. レンダリング ---
  if (loading) return (
    <div className="fixed inset-0 bg-[#f5f5f7] flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-8">
        <div className="relative w-20 h-20 mx-auto">
          <div className="absolute inset-0 border-4 border-indigo-100 rounded-2xl"></div>
          <div className="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-2xl animate-spin"></div>
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
    <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center p-2 overflow-hidden touch-none">
      <div className="bg-white text-slate-900 rounded-[40px] p-6 shadow-2xl border border-slate-100 w-full max-w-2xl h-full max-h-[90vh] flex flex-col relative overflow-hidden">
        <DrillHeader />
        <DrillCard onToggleFavorite={handleToggleFavorite} />
        <div className="h-12 shrink-0 flex items-center justify-center">
          {isListening ? (
             <span className="text-xs font-black text-rose-500 animate-pulse uppercase tracking-[0.2em]">Recording...</span>
          ) : isAutoPlaying ? (
             <span className="text-xs font-black text-indigo-600 animate-pulse uppercase tracking-[0.3em]">Auto Playing</span>
          ) : (
            <p className="text-xs font-black text-slate-200 uppercase tracking-widest">Tap card to flip</p>
          )}
        </div>
        <DrillControls 
          isListening={isListening}
          timeLeft={timeLeft}
          onNext={handleNext}
          onSaveResume={handleSaveAndExit}
          onToggleAutoPlay={handleToggleAutoPlay}
          onSpeak={() => speak(currentPhrase.phrase_en)}
          onVoiceCheck={handleVoiceCheck}
        />
        <DrillFeedback feedback={feedback} analysis={analysis} onClose={() => setFeedback(null)} />
        <DrillIndex isOpen={showIndex} onSelect={(idx) => jumpTo(idx, 0)} />
      </div>
      <style jsx global>{`
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
}