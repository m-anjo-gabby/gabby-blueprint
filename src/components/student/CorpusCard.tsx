'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Volume2, Mic, ChevronLeft, ArrowRight, List, Star, X } from 'lucide-react';
import { useVoice } from '@/hooks/useVoice';
import { getTrainingData, toggleFavorite } from '@/actions/corpusAction';
import { calculateSimilarity } from '@/utils/stringSimilarity';
import { TrainingWord } from '@/types/training';

// 評価設定の型定義
type FeedbackConfig = {
  fill: string;
  text: string;
  tagText: string;
  isSuccess: boolean;
};

/**
 * 類似度に基づいた5段階評価設定の取得
 */
const getFeedbackConfig = (ratio: number): FeedbackConfig => {
  if (ratio >= 0.90) return { fill: '#10B981', text: 'text-green-600', tagText: 'Excellent', isSuccess: true };
  if (ratio >= 0.80) return { fill: '#3B82F6', text: 'text-blue-600', tagText: 'Great', isSuccess: true };
  if (ratio >= 0.60) return { fill: '#F59E0B', text: 'text-yellow-600', tagText: 'Good', isSuccess: true };
  if (ratio >= 0.30) return { fill: '#F97316', text: 'text-orange-600', tagText: 'Fair', isSuccess: false };
  return { fill: '#EF4444', text: 'text-red-600', tagText: 'Poor', isSuccess: false };
};

export default function CorpusCard({ sectionId, onBack }: { sectionId: string, onBack: () => void }) {
  const [words, setWords] = useState<TrainingWord[]>([]);
  const [wordIdx, setWordIdx] = useState(0);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const [heardText, setHeardText] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackConfig | null>(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showIndex, setShowIndex] = useState(false);
  const [sortOrder, setSortOrder] = useState<'default' | 'alpha'>('default');
  
  const lastHeardRef = useRef<string>("");
  const activeWordRef = useRef<HTMLButtonElement | null>(null);
  const { speak, startListening, stopListening, isListening } = useVoice();

  // 初期データフェッチ
  useEffect(() => {
    async function init() {
      const data = await getTrainingData(sectionId);
      setWords(data);
      setLoading(false);
    }
    init();
  }, [sectionId]);

  /**
   * 現在の表示対象データを安全に取得
   * オプショナルチェイニング (?.) を使い、データ未ロード時のエラーを防ぎます。
   */
  const currentWord = words[wordIdx] || null;
  const currentPhrase = currentWord?.phrases?.[phraseIdx] || null;
  const isFavorite = !!currentPhrase?.is_favorite_initial;

  // 目次表示用のリストを計算（words 本体は書き換えない）
  const displayWords = useMemo(() => {
    const list = words.map((w, originalIdx) => ({ ...w, originalIdx }));
    if (sortOrder === 'alpha') {
      return list.sort((a, b) => a.word_en.localeCompare(b.word_en));
    }
    // デフォルトは frequency_rank 順（取得時の順序）
    return list;
  }, [words, sortOrder]);

  // A-Zタブの時だけ表示するインデックス文字リスト
  const alphabetIndex = useMemo(() => {
    if (sortOrder !== 'alpha') return [];
    const initials = displayWords.map(w => w.word_en.charAt(0).toUpperCase());
    return Array.from(new Set(initials)).sort();
  }, [displayWords, sortOrder]);

  // 特定の文字セクションへスクロールする関数
  const scrollToSection = (char: string) => {
    const element = document.getElementById(`section-head-${char}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 目次が開いた瞬間に実行するスクロール処理
  useEffect(() => {
    if (showIndex && activeWordRef.current) {
      // 画面中央付近にくるようにスクロール
      activeWordRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'center'
      });
    }
  }, [showIndex, sortOrder]); // showIndex が true（目次オープン）またはソートタブ切替時に実行

  useEffect(() => {
    // ポップアップまたは目次が開いている間、背後のスクロールを禁止
    if (feedback || showIndex) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [feedback, showIndex]);

  /**
   * 録音終了時の自動評価ロジック
   */
  useEffect(() => {
    // データが揃っていない、または音声入力がない場合は実行しない
    if (!isListening && lastHeardRef.current !== "" && currentPhrase) {
      // 1. 類似度を計算
      const similarity = calculateSimilarity(lastHeardRef.current, currentPhrase.phrase_en);
      
      // 2. 5段階評価を適用
      const config = getFeedbackConfig(similarity);
      
      setFeedback(config);
      lastHeardRef.current = "";
    }
  }, [isListening, currentPhrase]);

  /**
   * 録音中のカウントダウン制御
   */
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isListening) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [isListening]);

  /**
   * 重要：フックの定義（useState, useEffect）よりも後に
   * ローディングと空データのバリデーションを配置します。
   */
  if (loading) return <div className="p-20 text-center animate-pulse text-primary font-black">Loading Drill...</div>;
  if (!currentWord || !currentPhrase) return <div className="p-20 text-center font-bold">No data found.</div>;

  /**
   * ステップごとのラベル定義
   */
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

  /**
   * 次のステップへの遷移
   */
  const handleNext = () => {
    // 次へ行くときに読み上げを止める
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();

    setFeedback(null);
    setHeardText(null);
    setIsFlipped(false); // 次へ行くときは英語に戻す
    lastHeardRef.current = "";
    if (phraseIdx < currentWord.phrases.length - 1) {
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
      // 既に実行中の場合は stopListening を呼び出す（トグル動作）
      // これにより useEffect 内の判定ロジックがトリガーされます
      stopListening(); 
      return;
    }
    setFeedback(null);
    setHeardText(null);
    lastHeardRef.current = "";
    setTimeLeft(10); 
    
    startListening((heard) => {
      setHeardText(heard);
      lastHeardRef.current = heard;

      // 発話自動停止ロジック
      if (currentPhrase) {
        const similarity = calculateSimilarity(heard, currentPhrase.phrase_en);
        
        // 90%以上の精度（Excellent相当）に達したら自動で締め切る
        if (similarity >= 0.90) {
          // ユーザーに一瞬「言い切った」感覚を与えるため、わずかにディレイ（200ms）を挟んで停止
          setTimeout(() => {
            stopListening();
          }, 200);
        }
      }
    });
  };

  /**
   * 目次処理
   */
  const jumpToWord = (index: number) => {
    setWordIdx(index);
    setPhraseIdx(0);
    setFeedback(null);
    setHeardText(null);
    setIsFlipped(false);
    setShowIndex(false); // メニューを閉じる
  };

  /**
   * お気に入りの切り替え
   */
  const handleToggleFavorite = async () => {
    if (!currentPhrase) return;
    
    const nextState = !isFavorite;

    // wordsステートを更新し、スターに即時切替
    setWords(prevWords => {
      const newWords = [...prevWords];
      const targetWord = newWords[wordIdx];
      if (targetWord && targetWord.phrases[phraseIdx]) {
        // 既存の phrases 配列も新しいオブジェクトでコピーすることで、安全性確保
        targetWord.phrases = [...targetWord.phrases];
        targetWord.phrases[phraseIdx] = {
          ...targetWord.phrases[phraseIdx],
          is_favorite_initial: nextState
        };
      }
      return newWords;
    });
    
    try {
      await toggleFavorite(currentPhrase.phrase_id, nextState);
    } catch (error) {
      console.error("Favorite toggle failed:", error);
      // 失敗時は逆の操作をしてロールバック
      setWords(prevWords => {
        const newWords = [...prevWords];
        const targetWord = newWords[wordIdx];
        if (targetWord && targetWord.phrases[phraseIdx]) {
          targetWord.phrases[phraseIdx].is_favorite_initial = !nextState;
        }
        return newWords;
      });
    }
  };

  return (
    <div className="bg-white text-slate-900 rounded-[40px] p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-300 max-w-2xl mx-auto h-[95svh] md:h-[80svh] min-h-[80svh] max-h-[95svh] flex flex-col relative overflow-hidden">
      
      {/* --- 全画面フィードバックポップアップ --- */}
      {feedback && (
        <div 
          className="absolute inset-0 z-100 flex items-center justify-center p-6 animate-in fade-in duration-200"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)' }} // Safari安定用のインラインCSS
          onClick={() => setFeedback(null)} 
        >
          {/* ポップアップ本体 */}
          <div 
            className="relative z-110 bg-white w-full max-w-sm rounded-4xl p-8 shadow-2xl flex flex-col items-center gap-6 animate-in zoom-in-95 duration-300 border border-slate-100"
            onClick={(e) => e.stopPropagation()} 
          >
            <div className="absolute top-0 right-0 p-4">
              <button 
                onClick={() => setFeedback(null)}
                className="p-2 text-slate-400 hover:text-slate-600 transition-colors touch-manipulation"
              >
                <X size={24} strokeWidth={2.5} />
              </button>
            </div>

            {/* 評価タグ */}
            <div className={`text-[10px] font-black px-6 py-2 rounded-full border uppercase tracking-[0.3em] shadow-sm ${feedback.text}`}
                style={{ backgroundColor: `${feedback.fill}15`, borderColor: `${feedback.fill}40`, color: feedback.fill }}>
              {feedback.tagText}
            </div>

            <div className="text-center space-y-3">
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest block">You said</span>
              <p className="text-xl font-bold text-slate-800 italic leading-tight px-2">
                {heardText}
              </p>
            </div>

            {/* 今後のAIコメント用スペース（不透明な背景で読みやすく） */}
            <div className="w-full p-5 bg-slate-50 rounded-3xl border border-slate-100">
              <p className="text-[11px] text-slate-500 leading-relaxed italic text-center">
                Tap anywhere to close
              </p>
            </div>

            <button 
              onClick={() => setFeedback(null)}
              className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-indigo-600 transition-colors pt-2"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* --- 単語目次オーバーレイ --- */}
      {showIndex && (
        <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm p-8 animate-in fade-in zoom-in-95 duration-200 flex flex-col">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Select Word</span>
            <button onClick={() => setShowIndex(false)} className="text-slate-400 hover:text-slate-900 font-bold text-xs uppercase tracking-widest">Close</button>
          </div>

          {/* ソート切り替えタブ */}
          <div className="flex gap-4 mb-6 border-b border-slate-100 shrink-0">
            <button 
              onClick={() => setSortOrder('default')}
              className={`pb-2 text-[10px] font-black uppercase tracking-wider transition-all ${sortOrder === 'default' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}
            >
              Rank
            </button>
            <button 
              onClick={() => setSortOrder('alpha')}
              className={`pb-2 text-[10px] font-black uppercase tracking-wider transition-all ${sortOrder === 'alpha' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}
            >
              A-Z
            </button>
          </div>
          
          <div className="flex-1 flex overflow-hidden relative">
            {/* 単語リスト */}
            <div className="flex-1 overflow-y-auto pr-6 space-y-1 custom-scrollbar">
              {displayWords.map((w, idx) => {
                // アルファベット順の時だけ、頭文字の区切りを表示
                const currentInitial = w.word_en.charAt(0).toUpperCase();
                const prevInitial = idx > 0 ? displayWords[idx - 1].word_en.charAt(0).toUpperCase() : null;
                const showSection = sortOrder === 'alpha' && currentInitial !== prevInitial;

                return (
                  <div key={`section-${w.word_id}`}>
                    {/* セクションヘッダー (A, B, C...) */}
                    {showSection && (
                      <div 
                        id={`section-head-${currentInitial}`}
                        className="px-4 py-4 mt-2 mb-1 scroll-mt-4"
                      >
                        <span className="text-xl font-black text-indigo-300/50 italic tracking-tighter">
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
                          {/* Rank表示の場合は番号、A-Zの場合は単語を強調 */}
                          {sortOrder === 'default' ? `${w.originalIdx + 1}. ` : ''}{w.word_en}
                        </span>
                        <span className="text-[10px] font-medium text-slate-400">
                          {w.word_ja}
                        </span>
                      </div>
                      
                      {wordIdx === w.originalIdx && (
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-indigo-400 uppercase tracking-tighter">Current</span>
                          <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-pulse" />
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* クイックインデックスバー (A-Zタブの時のみ右端に表示) */}
            {sortOrder === 'alpha' && alphabetIndex.length > 0 && (
              <div className="flex flex-col justify-center gap-1 pl-2 border-l border-slate-50 shrink-0">
                {alphabetIndex.map(char => (
                  <button
                    key={char}
                    onClick={() => scrollToSection(char)}
                    className="text-[10px] font-black text-slate-400 hover:text-indigo-600 w-6 h-6 flex items-center justify-center rounded-full hover:bg-indigo-50 transition-all"
                  >
                    {char}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ヘッダーエリア (最上部固定) --- */}
      <div className="space-y-4 shrink-0 border-b border-slate-100 pb-5 mb-4">
        {/* 上段: バックボタン */}
        <div className="flex justify-start">
          <button onClick={onBack} className="group text-slate-400 hover:text-indigo-600 flex items-center text-[10px] font-black tracking-widest transition-all">
            <ChevronLeft size={14} className="mr-1 group-hover:-translate-x-0.5 transition-transform" /> 
            BACK TO DASHBOARD
          </button>
        </div>
        {/* 下段: 左に単語、右に進捗数 */}
        <div className="flex justify-between items-end">
          <div className="flex flex-col items-start space-y-1">
            <button onClick={() => setShowIndex(true)} className="flex items-center gap-1.5 px-2 -ml-2 py-1 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-indigo-600 transition-all group">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] leading-none">Vocabulary</span>
              <List size={14} className="text-indigo-500" />
            </button>
            <span className="text-xl font-black text-slate-900 leading-none tracking-tight">
              {currentWord.word_en}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <div className="flex items-baseline gap-1">
              <span className="text-base font-black text-indigo-600">{wordIdx + 1}</span>
              <span className="text-sm font-bold text-slate-300">/</span>
              <span className="text-sm font-bold text-slate-400 tracking-tighter">{words.length}</span>
              <span className="text-[10px] font-bold text-slate-400 tracking-tighter">WORDS</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Drill Area */}
      <div className="flex-1 flex flex-col items-center">

        {/* ステップ・お気に入りエリア */}
        <div className="relative w-full max-w-lg mb-5 flex flex-col items-center">
          
          {/* 1. 上段中央：インジケータドット（常にど真ん中） */}
          <div className="flex gap-1.5 mb-2">
            {[1, 2, 3, 4, 5].map(s => (
              <div 
                key={s} 
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  s <= currentPhrase.phrase_type ? 'bg-indigo-600' : 'bg-slate-100'
                }`} 
              />
            ))}
          </div>

          {/* 2. 下段：左右固定要素と中央ラベルのコンテナ */}
          <div className="relative w-full flex items-center justify-center min-h-8">
            {/* 左端：STEPタグ */}
            <div className="absolute left-0">
              <span className="text-[9px] font-black text-indigo-600 border border-indigo-200 bg-indigo-50/50 px-2 py-0.5 rounded-md uppercase tracking-wider">
                STEP {currentPhrase.phrase_type}
              </span>
            </div>
            {/* 中央：ステップラベル（PXを確保して重なりを防止） */}
            <div className="px-16">
              <span className="text-[11px] font-bold text-slate-500 italic tracking-wide text-center block leading-tight">
                {getStepLabel(currentPhrase.phrase_type).split(': ')[1]}
              </span>
            </div>
            {/* 右端：スターボタン */}
            <div className="absolute right-0 -top-2">
              <button 
                onClick={handleToggleFavorite} 
                className={`p-2 transition-all duration-300 hover:scale-110 ${
                  isFavorite ? 'text-amber-400' : 'text-slate-200 hover:text-slate-300'
                }`}
              >
                <Star size={28} fill={isFavorite ? "currentColor" : "none"} strokeWidth={isFavorite ? 1 : 2} />
              </button>
            </div>
          </div>
        </div>

        {/* メインのカード表示 */}
        <div className="w-full max-w-lg mt-4 mb-8 items-center justify-center text-center">

          {/* フレーズ表示カード */}
          <div 
            className="relative w-full min-h-40 cursor-pointer group"
            style={{ perspective: '1000px' }}
            onClick={() => setIsFlipped(!isFlipped)}
          >
            <div 
              className="relative w-full h-full transition-all duration-500"
              style={{ 
                transformStyle: 'preserve-3d',
                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                minHeight: '140px'
              }}
            >
              {/* 表：英語 (Front) */}
              <div 
                className="absolute inset-0 w-full h-full flex items-center justify-center"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <div className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-[1.2] px-4">
                  {currentPhrase.phrase_en}
                </div>
              </div>

              {/* 裏：日本語 (Back) */}
              <div 
                className="absolute inset-0 w-full h-full flex items-center justify-center"
                style={{ 
                  backfaceVisibility: 'hidden', 
                  transform: 'rotateY(180deg)' 
                }}
              >
                <div className="text-2xl md:text-3xl font-bold text-indigo-600 tracking-tight leading-[1.4] px-6">
                  {currentPhrase.phrase_ja}
                </div>
              </div>
            </div>
            
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              Click to reveal translation
            </div>
          </div>
        </div>

        {/* Recording Status */}
        <div className="min-h-16 flex items-center justify-center">
          {isListening ? (
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-rose-500 rounded-full animate-ping" />
              <span className="text-[10px] font-black text-rose-500 uppercase tracking-[0.3em]">Recording...</span>
            </div>
          ) : (
            <div className="opacity-20 flex items-center gap-2">
              <Mic size={16} />
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">Ready for Voice Check</span>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-4 shrink-0">
        <button 
          onClick={handleNext} 
          disabled={isListening}
          className="w-full py-6 bg-indigo-600 text-white rounded-[28px] font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all flex items-center justify-center gap-2 uppercase tracking-wide text-sm"
        >
          {phraseIdx < (currentWord?.phrases?.length ?? 0) - 1 ? "Next Step" : "Next Word"}
          <ArrowRight size={18} />
        </button>

        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => speak(currentPhrase.phrase_en)}
            disabled={isListening}
            className="py-5 bg-slate-50 text-slate-700 rounded-[28px] font-bold flex items-center justify-center gap-3 border border-slate-200/50 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm uppercase"
          >
            <Volume2 size={18} className="text-indigo-600" /> Listen
          </button>

          <button 
            onClick={handleVoiceCheck} 
            className={`relative py-5 rounded-[28px] font-bold flex items-center justify-center gap-3 transition-all overflow-hidden text-sm uppercase ${
              isListening ? 'bg-rose-500 text-white' : 'bg-slate-900 text-white hover:opacity-90'
            }`}
          >
            {isListening && (
              <div 
                className="absolute inset-0 bg-rose-600 opacity-30 origin-left transition-transform duration-1000 ease-linear" 
                style={{ transform: `scaleX(${timeLeft / 10})` }} 
              />
            )}
            <div className="relative z-10 flex items-center gap-2">
              <Mic size={18} className={isListening ? 'animate-pulse' : ''} />
              <span>{isListening ? `${timeLeft}s Stop` : 'Speak'}</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}