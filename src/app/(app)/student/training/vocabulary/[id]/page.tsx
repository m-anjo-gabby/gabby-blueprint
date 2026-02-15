'use client';

import { useState, useEffect, useRef, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import { Volume2, Mic, ChevronLeft, ArrowRight, List, Star, X, ChevronDown } from 'lucide-react';

// Hooks & Actions
import { useVoice } from '@/hooks/useVoice';
import { getTrainingData, toggleFavorite } from '@/actions/corpusAction';
import { calculateSimilarity } from '@/utils/stringSimilarity';
import { TrainingWord } from '@/types/training';
import { useToast } from '@/hooks/useToast';
import { AnimatePresence, motion } from 'framer-motion';

// --- Types ---
// 評価設定
type FeedbackConfig = {
  fill: string;
  text: string;
  tagText: string;
  isSuccess: boolean;
};

// --- Configs ---
// ドリル定義
const DRILL_CONFIG = {
  RECORDING_LIMIT: 7,       // 録音制限時間（秒）
  AUTO_STOP_THRESHOLD: 0.90, // この類似度を超えたら自動で録音を停止
};

/**
 * 類似度に基づいた5段階評価設定を取得
 */
const getFeedbackConfig = (ratio: number): FeedbackConfig => {
  if (ratio >= 0.90) return { fill: '#10B981', text: 'text-green-600', tagText: 'Excellent', isSuccess: true };
  if (ratio >= 0.80) return { fill: '#3B82F6', text: 'text-blue-600', tagText: 'Great', isSuccess: true };
  if (ratio >= 0.60) return { fill: '#F59E0B', text: 'text-yellow-600', tagText: 'Good', isSuccess: true };
  if (ratio >= 0.30) return { fill: '#F97316', text: 'text-orange-600', tagText: 'Fair', isSuccess: false };
  return { fill: '#EF4444', text: 'text-red-600', tagText: 'Poor', isSuccess: false };
};

/**
 * 語彙トレーニング実行ページ
 */
export default function VocabularyTrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: sectionId } = use(params); // URLパラメータからIDを取得
  const { showToast } = useToast();
  const { speak, startListening, stopListening, isListening } = useVoice();

  // --- States ---
  const [corpusName, setCorpusName] = useState("");
  const [words, setWords] = useState<TrainingWord[]>([]);
  const [wordIdx, setWordIdx] = useState(0);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const [heardText, setHeardText] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackConfig | null>(null);
  const [timeLeft, setTimeLeft] = useState(DRILL_CONFIG.RECORDING_LIMIT);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showIndex, setShowIndex] = useState(false);
  const [sortOrder, setSortOrder] = useState<'default' | 'alpha'>('default');
  
  const lastHeardRef = useRef<string>("");
  const activeWordRef = useRef<HTMLButtonElement | null>(null);

  // 初期データフェッチ
  useEffect(() => {
    async function init() {
      try {
        // 分割代入で受け取る
        const { words, corpusName } = await getTrainingData(sectionId);
        setWords(words);
        setCorpusName(corpusName);
      } catch (error) {
        console.error("Failed to fetch training data:", error);
        showToast("データの読み込みに失敗しました", "error");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [sectionId, showToast]);

  // 語彙データ
  const currentWord = words[wordIdx] || null;
  const currentPhrase = currentWord?.phrases?.[phraseIdx] || null;
  const isFavorite = !!currentPhrase?.is_favorite_initial;

  // 目次用：現在のソート順に基づいたリスト
  const displayWords = useMemo(() => {
    const list = words.map((w, originalIdx) => ({ ...w, originalIdx }));
    if (sortOrder === 'alpha') {
      return list.sort((a, b) => a.word_en.localeCompare(b.word_en));
    }
    return list;
  }, [words, sortOrder]);

  // A-Zタブの時だけ表示するインデックス文字リスト
  const alphabetIndex = useMemo(() => {
    if (sortOrder !== 'alpha') return [];
    const initials = displayWords.map(w => w.word_en.charAt(0).toUpperCase());
    return Array.from(new Set(initials)).sort();
  }, [displayWords, sortOrder]);

  // --- Effects: UI & Voice ---

  // 目次が開いた時に現在の単語までスクロール
  useEffect(() => {
    if (showIndex && activeWordRef.current) {
      activeWordRef.current.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
  }, [showIndex, sortOrder]);

  // ポップアップ表示中のスクロール制御
  useEffect(() => {
    document.body.style.overflow = (feedback || showIndex) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [feedback, showIndex]);

  // 音声認識終了時の評価判定
  useEffect(() => {
    if (!isListening && lastHeardRef.current !== "" && currentPhrase) {
      const similarity = calculateSimilarity(lastHeardRef.current, currentPhrase.phrase_en);
      const config = getFeedbackConfig(similarity);
      setFeedback(config);
      lastHeardRef.current = "";
    }
  }, [isListening, currentPhrase]);

  // 録音カウントダウン
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isListening) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            stopListening();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [isListening, stopListening]);

  // --- Handlers ---

  /**
   * Next処理
   */
  const handleNext = () => {
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    setFeedback(null);
    setHeardText(null);
    setIsFlipped(false);
    setTimeLeft(DRILL_CONFIG.RECORDING_LIMIT);
    lastHeardRef.current = "";

    if (phraseIdx < (currentWord?.phrases.length || 0) - 1) {
      setPhraseIdx(prev => prev + 1);
    } else {
      setPhraseIdx(0);
      setWordIdx(prev => (prev + 1) % words.length);
    }
  };

  /**
   * 音声認識の実行
   */
  const handleVoiceCheck = () => {
    if (isListening) {
      stopListening();
      return;
    }
    setFeedback(null);
    setHeardText(null);
    lastHeardRef.current = "";
    setTimeLeft(DRILL_CONFIG.RECORDING_LIMIT);
    
    startListening((heard) => {
      setHeardText(heard);
      lastHeardRef.current = heard;

       // 発話自動停止ロジック
      if (currentPhrase) {
        const similarity = calculateSimilarity(heard, currentPhrase.phrase_en);
        
        // 90%以上の類似度で自動停止
        if (similarity >= DRILL_CONFIG.AUTO_STOP_THRESHOLD) {
          // ユーザーが「言い切った」と感じるための僅かな余韻
          setTimeout(() => {
            stopListening();
          }, 250); 
        }
      }
    });
  };

  /**
   * お気に入り切替
   */
  const handleToggleFavorite = async () => {
    if (!currentPhrase) return;
    const nextState = !isFavorite;

    // 楽観的UI更新
    setWords(prev => {
      const newWords = [...prev];
      const target = newWords[wordIdx];
      if (target?.phrases[phraseIdx]) {
        target.phrases = [...target.phrases];
        target.phrases[phraseIdx] = { ...target.phrases[phraseIdx], is_favorite_initial: nextState };
      }
      return newWords;
    });
    
    try {
      await toggleFavorite(currentPhrase.phrase_id, nextState);
      showToast(nextState ? 'お気に入りに追加しました' : 'お気に入りから削除しました', 'success');
    } catch (error) {
      console.error(error);
      // ロールバック処理
    }
  };

  /**
   * 目次：語彙切替処理
   */
  const jumpToWord = (index: number) => {
    setWordIdx(index);
    setPhraseIdx(0);
    setFeedback(null);
    setIsFlipped(false);
    setShowIndex(false);
  };

  // --- Render Helpers ---
  const getStepLabel = (type: number) => {
    const labels: Record<number, string> = {
      1: "STEP 1: S+V (Core Business)",
      2: "STEP 2: Adding Technical Domain",
      3: "STEP 3: Strategic Solution",
      4: "STEP 4: PAST (Performance Result)",
      5: "STEP 5: PRESENT PERFECT (Key Success)"
    };
    return labels[type] || `STEP ${type}`;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-slate-50">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-slate-400 font-black animate-pulse uppercase tracking-widest text-xs">Loading Drill...</p>
      </div>
    </div>
  );

  if (!currentWord || !currentPhrase) return <div className="p-20 text-center font-bold">No data found.</div>;

  return (
    // 親コンテナをfixedにし、画面揺れ抑止
    <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden touch-none">
      {/* ドリルカード全体 h-full と max-w を調整し、画面内に必ず収まるようにする */}
      <div className="bg-white text-slate-900 rounded-4xl sm:rounded-[40px] p-5 sm:p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300 w-full max-w-2xl h-full max-h-225 flex flex-col relative overflow-hidden">
        
        {/* 音声認識フィードバック オーバーレイ */}
        {feedback && (
          <div 
            className="absolute inset-0 z-100 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" 
            onClick={() => setFeedback(null)}
          >
            <div className="relative bg-white w-full max-w-sm rounded-4xl p-8 shadow-2xl flex flex-col items-center gap-6 animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setFeedback(null)} className="absolute top-4 right-4 p-2 text-slate-300 hover:text-slate-500"><X size={24} /></button>
              <div className="px-6 py-2 rounded-full border uppercase text-[10px] font-black tracking-widest" style={{ backgroundColor: `${feedback.fill}15`, borderColor: `${feedback.fill}40`, color: feedback.fill }}>{feedback.tagText}</div>
              <div className="text-center space-y-2">
                <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest block">You said</span>
                <p className="text-xl font-bold text-slate-800 italic leading-tight">{heardText}</p>
              </div>
              <div className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center text-[11px] text-slate-400 italic">Tap anywhere to close</div>
            </div>
          </div>
        )}

        {/* 目次  オーバーレイ */}
        {showIndex && (
          <div className="absolute inset-0 z-50 bg-white/98 backdrop-blur-md p-8 animate-in slide-in-from-bottom duration-300 flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Select Word</span>
              <button onClick={() => setShowIndex(false)} className="text-slate-400 hover:text-slate-900 font-bold text-xs uppercase tracking-widest p-2">Close</button>
            </div>

            {/* Sort Tabs: as const を使って any を回避 */}
            <div className="flex gap-4 mb-6 border-b border-slate-100 shrink-0">
              {(['default', 'alpha'] as const).map((mode) => (
                <button 
                  key={mode}
                  onClick={() => setSortOrder(mode)}
                  className={`pb-2 text-[10px] font-black uppercase tracking-wider transition-all ${
                    sortOrder === mode ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-300'
                  }`}
                >
                  {mode === 'default' ? 'By Rank' : 'A to Z'}
                </button>
              ))}
            </div>
            
            <div className="flex-1 flex overflow-hidden relative">
              {/* --- 単語リストエリア --- */}
              <div className="flex-1 overflow-y-auto pr-4 space-y-1 custom-scrollbar">
                {displayWords.map((w, idx) => {
                  // アルファベット順の時だけ、頭文字が変わるタイミングでセクションヘッダーを挿入
                  const currentInitial = w.word_en.charAt(0).toUpperCase();
                  const prevInitial = idx > 0 ? displayWords[idx - 1].word_en.charAt(0).toUpperCase() : null;
                  const showSection = sortOrder === 'alpha' && currentInitial !== prevInitial;

                  return (
                    <div key={`section-${w.word_id}`}>
                      {showSection && (
                        <div 
                          id={`section-head-${currentInitial}`}
                          className="px-4 py-4 mt-2 mb-1 scroll-mt-4"
                        >
                          <span className="text-xl font-black text-indigo-200 italic tracking-tighter">
                            {currentInitial}
                          </span>
                          <div className="h-px w-full bg-slate-50 mt-1" />
                        </div>
                      )}

                      <button
                        ref={wordIdx === w.originalIdx ? activeWordRef : null}
                        onClick={() => jumpToWord(w.originalIdx)}
                        className={`w-full text-left px-4 py-3 rounded-2xl transition-all flex items-center justify-between group ${
                          wordIdx === w.originalIdx 
                            ? 'bg-indigo-50 border border-indigo-100 ring-1 ring-indigo-100' 
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className={`text-sm font-bold ${wordIdx === w.originalIdx ? 'text-indigo-600' : 'text-slate-700'}`}>
                            {sortOrder === 'default' ? `${w.originalIdx + 1}. ` : ''}{w.word_en}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">
                            {w.word_ja}
                          </span>
                        </div>
                        
                        {wordIdx === w.originalIdx && (
                          <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-pulse" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* --- クイックインデックスバー (A-Zタブの時のみ右端に表示) --- */}
              {sortOrder === 'alpha' && alphabetIndex.length > 0 && (
                <div className="flex flex-col justify-center gap-1 pl-2 border-l border-slate-50 shrink-0">
                  {alphabetIndex.map(char => (
                    <button
                      key={char}
                      onClick={() => {
                        const element = document.getElementById(`section-head-${char}`);
                        element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="text-[10px] font-black text-slate-300 hover:text-indigo-600 w-6 h-6 flex items-center justify-center rounded-full hover:bg-indigo-50 transition-all"
                    >
                      {char}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ヘッダーエリア */}
        <div className="shrink-0 border-b border-slate-50 pb-3 sm:pb-5">
          {/* 上段: バックボタン & コーパス名 */}
          <div className="flex justify-between items-center mb-4">
            <button 
              onClick={() => router.back()} 
              className="group text-slate-400 hover:text-indigo-600 flex items-center text-[10px] font-black tracking-widest transition-colors p-1 -ml-1"
            >
              <ChevronLeft size={20} className="mr-0.5 group-hover:-translate-x-0.5 transition-transform" /> 
              BACK
            </button>
            
            {/* コーパス名（現在のセクション名など）を表示 */}
            {/* words[0]?.section_name のようなプロパティがあればそれを表示してください */}
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider truncate max-w-37.5 sm:max-w-none">
              {corpusName || 'Business English Core'} 
            </span>
          </div>

          {/* 下段: 左に単語、右に進捗数 */}
          <div className="flex justify-between items-end">
            <div>
              <button 
                onClick={() => setShowIndex(true)} 
                className="flex items-center gap-1.5 text-slate-400 hover:text-indigo-600 transition-all mb-1.5 group px-2 py-1 -ml-2 rounded-lg hover:bg-slate-50"
              >
                {/* リストアイコン：少しだけ存在感を出す */}
                <List size={13} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
                
                {/* テキスト：ラベルとしての品格を保つ */}
                <span className="text-[10px] font-black uppercase tracking-[0.15em]">Vocabulary</span>
                
                {/* ChevronDown：常時表示にして「開ける」ことを明示 */}
                <ChevronDown 
                  size={12} 
                  className="text-slate-300 group-hover:text-indigo-400 transition-transform group-hover:translate-y-0.5" 
                />
              </button>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">
                {currentWord.word_en}
              </h1>
            </div>
            <div className="text-right bg-slate-50 px-3 py-1 rounded-xl border border-slate-100/50">
              <span className="text-lg font-black text-indigo-600 tabular-nums">{wordIdx + 1}</span>
              <span className="text-xs font-bold text-slate-200 mx-1">/</span>
              <span className="text-xs font-bold text-slate-400 tabular-nums">{words.length}</span>
            </div>
          </div>
        </div>

        {/* メイン：ドリルエリア */}
        <div className="flex-1 min-h-0 flex flex-col items-center py-2 sm:py-4">
          {/* ステップ・お気に入りエリア */}
          <div className="w-full shrink-0 flex flex-col items-center mb-6 sm:mb-10">
            {/* プログレスドット: 少し大きく、間隔を広げて視認性アップ */}
            <div className="flex gap-2.5 mb-5 sm:mb-6">
              {[1, 2, 3, 4, 5].map(s => (
                <div 
                  key={s} 
                  className={`w-2 h-2 rounded-full transition-all duration-700 ${
                    s <= currentPhrase.phrase_type 
                    ? 'bg-indigo-600 scale-125 shadow-[0_0_8px_rgba(79,70,229,0.4)]' 
                    : 'bg-slate-200'
                  }`} 
                />
              ))}
            </div>

            {/* ラベル & お気に入り: 高さを揃え、文字を読みやすく */}
            <div className="w-full flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-black text-white bg-indigo-600 px-2.5 py-1 rounded-md tracking-wider">
                  STEP {currentPhrase.phrase_type}
                </span>
                <span className="text-xs font-bold text-slate-500 italic truncate max-w-45 sm:max-w-none">
                  {getStepLabel(currentPhrase.phrase_type).split(': ')[1]}
                </span>
              </div>
              
              <button 
                onClick={handleToggleFavorite} 
                className={`p-1 transition-all active:scale-75 hover:scale-110 ${
                  isFavorite ? 'text-amber-400' : 'text-slate-200 hover:text-slate-300'
                }`}
              >
                <Star size={28} fill={isFavorite ? "currentColor" : "none"} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* フレーズ表示 Flip Card */}
          <div className="w-full flex-1 min-h-0 flex items-center justify-center relative overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                // key に phrase_id または word_id を指定することで、切り替えを検知
                key={`${currentWord.word_id}-${phraseIdx}`} 
                
                // アニメーションの開始状態
                initial={{ opacity: 0, x: 30 }} 
                // アニメーション完了状態（表示される時）
                animate={{ opacity: 1, x: 0 }} 
                // 消えゆく時の状態
                exit={{ opacity: 0, x: -30 }} 
                
                // transition の設定（springを使うとリッチに）
                transition={{ 
                  duration: 0.25, 
                  ease: "easeOut" 
                }}
                className="w-full h-full flex items-center justify-center perspective-1000"
                onClick={() => setIsFlipped(!isFlipped)}
              >
                {/* Flip Card 構造 */}
                <div className={`relative w-full h-full max-h-64 transition-all duration-500 preserve-3d cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}>
                  
                  {/* 表：英語 */}
                  <div className="absolute inset-0 backface-hidden flex items-center justify-center text-center p-2 sm:p-4">
                    <p className="text-3xl md:text-4xl font-black text-slate-900 leading-tight wrap-break-word">
                      {currentPhrase.phrase_en}
                    </p>
                  </div>

                  {/* 裏：日本語 */}
                  <div className="absolute inset-0 backface-hidden rotate-y-180 flex items-center justify-center text-center p-2 sm:p-4">
                    <p className="text-2xl md:text-3xl font-bold text-indigo-600 leading-relaxed wrap-break-word">
                      {currentPhrase.phrase_ja}
                    </p>
                  </div>

                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ステータス（メッセージ） */}
          <div className="h-10 sm:h-12 shrink-0 flex items-center justify-center">
            {isListening ? (
              <div className="flex items-center gap-2 animate-pulse">
                <div className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                <span className="text-[9px] font-black text-rose-500 uppercase tracking-[0.2em]">Recording...</span>
              </div>
            ) : (
              <p className="text-[8px] font-black text-slate-200 uppercase tracking-widest">Tap card to flip / Speak to check</p>
            )}
          </div>

        </div>

        {/* コントロール（ボタン）エリア */}
        <div className="shrink-0 space-y-2 sm:space-y-3 pt-2 w-full flex flex-col items-center">
          
          {/* メインアクション: Next */}
          <button 
            onClick={handleNext} 
            disabled={isListening}
            className="w-full max-w-sm py-5 bg-indigo-600 text-white rounded-3xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 hover:shadow-indigo-200 hover:-translate-y-0.5 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest disabled:opacity-50"
          >
            {phraseIdx < (currentWord.phrases.length - 1) ? "Next Step" : "Next Word"}
            <ArrowRight size={16} />
          </button>

          {/* サブアクション: Listen / Speak */}
          <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
            <button 
              onClick={() => speak(currentPhrase.phrase_en)}
              disabled={isListening}
              className="py-4 bg-slate-50 text-slate-600 rounded-3xl font-bold border border-slate-100 hover:bg-slate-100 hover:border-slate-200 hover:-translate-y-0.5 flex items-center justify-center gap-2 text-[11px] uppercase transition-all disabled:opacity-50"
            >
              <Volume2 size={16} className="text-indigo-500" /> Listen
            </button>
            <button 
              onClick={handleVoiceCheck} 
              className={`relative py-4 rounded-3xl font-bold flex items-center justify-center gap-2 text-[11px] uppercase transition-all overflow-hidden hover:-translate-y-0.5 ${isListening ? 'bg-rose-500 text-white shadow-lg shadow-rose-100' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
            >
              {isListening && (
                <div 
                  className="absolute inset-0 bg-rose-600/30 origin-left transition-transform duration-1000 ease-linear" 
                  style={{ transform: `scaleX(${timeLeft / DRILL_CONFIG.RECORDING_LIMIT})` }} 
                />
              )}
              <Mic size={16} className={isListening ? 'animate-pulse relative z-10' : 'relative z-10'} />
              <span className="relative z-10">{isListening ? `${timeLeft}s Stop` : 'Speak'}</span>
            </button>
          </div>
          
        </div>

      </div>
      
      {/* Tailwind Layout Adjustment for Flip Card */}
      <style jsx global>{`
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
}