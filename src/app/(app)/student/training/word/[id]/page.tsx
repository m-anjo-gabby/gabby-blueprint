'use client';

import { useState, useEffect, useRef, useMemo, use, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Volume2, Mic, ChevronLeft, ArrowRight, List, Star, X, ChevronDown, BookOpen, Bookmark, RotateCw } from 'lucide-react';

// Hooks & Actions
import { useVoice } from '@/hooks/useVoice';
import { clearResumeContent, getLatestResumeContent, saveResumeContent } from '@/actions/contentAction';
import { analyzePhrase } from '@/utils/stringSimilarity';
import { WordResumeMetadata } from '@/types/training';
import { useToast } from '@/hooks/useToast';
import { AnimatePresence, motion } from 'framer-motion';
import { TrainingWord } from '@/types/word';
import { getWordData, toggleFavorite } from '@/actions/wordAction';
import { useConfirm } from '@/hooks/useConfirm';

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
export default function WordTrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { id: sectionId } = use(params); // URLパラメータからIDを取得
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const { speak, startListening, stopListening, isListening, isSpeaking } = useVoice();

  // --- States ---
  const [contentName, setContentName] = useState("");
  const [words, setWords] = useState<TrainingWord[]>([]);
  const [wordIdx, setWordIdx] = useState(0);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [activeTooltipIndex, setActiveTooltipIndex] = useState<number>(-1);
  const [loading, setLoading] = useState(true);
  
  const [heardText, setHeardText] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackConfig | null>(null);
  const [timeLeft, setTimeLeft] = useState(DRILL_CONFIG.RECORDING_LIMIT);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showIndex, setShowIndex] = useState(false);
  const [sortOrder, setSortOrder] = useState<'default' | 'alpha'>('default');
  
  const lastHeardRef = useRef<string>("");
  const activeWordRef = useRef<HTMLButtonElement | null>(null);
  const isInitialized = useRef(false);

  // 初期データフェッチ
  useEffect(() => {
    // 既に初期化済みなら何もしない
    if (isInitialized.current) return;
    isInitialized.current = true;

    async function init() {
      try {
        // Wordデータの取得
        const { words, contentName }= await getWordData(sectionId);

        let targetWordIdx = 0;
        let targetPhraseIdx = 0;

        // URLに resume=true があれば栞を探す
        if (searchParams.get('resume') === 'true') {
          const resume = await getLatestResumeContent();
          
          if (resume && resume.content_id === sectionId) {
            // 全単語の全フレーズをフラットに走査して、item_id が一致する場所を特定
            words.some((word, wIdx) => {
              const pIdx = word.phrases.findIndex(p => p.phrase_id === resume.item_id);
              if (pIdx !== -1) {
                targetWordIdx = wIdx;
                targetPhraseIdx = pIdx;
                return true; // ループ終了
              }
              return false;
            });
            
            showToast("前回の続きから再開しました", "success");
            await clearResumeContent(); // 使用済みの栞をクリア
          }
        }

        setWords(words);
        setContentName(contentName);
        setWordIdx(targetWordIdx);
        setPhraseIdx(targetPhraseIdx);
      } catch (error) {
        console.error("Failed to fetch training data:", error);
        showToast("データの読み込みに失敗しました", "error");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [sectionId, searchParams, showToast]);

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
    // 1. ガード節で currentWord と currentPhrase の存在を確認
    if (!isListening && lastHeardRef.current !== "" && currentPhrase && currentWord) {
      // 単語ベースで解析
      const { score } = analyzePhrase(
        lastHeardRef.current, 
        currentPhrase.phrase_en, 
        [currentWord.word_en]
      );
      
      const config = getFeedbackConfig(score); // score (0.0~1.0) を渡す
      setFeedback(config);
      lastHeardRef.current = "";
    }
    // 3. 依存配列はオブジェクト全体にする（値が変わったことを検知できる）
  }, [isListening, currentPhrase, currentWord]);

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
  const handleNext = useCallback(() => {
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
    // 依存するもの（状態の更新に使う値）を配列に入れる
  }, [phraseIdx, currentWord?.phrases.length, words.length]);

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
      if (currentPhrase && currentWord) {
        // 単語一致率で判定
        const { score } = analyzePhrase(heard, currentPhrase.phrase_en, [currentWord.word_en]);
        
        // 90%（ほぼ全ての単語）を言えたら自動停止
        if (score >= DRILL_CONFIG.AUTO_STOP_THRESHOLD) {
          setTimeout(() => {
            stopListening();
          }, 300); 
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

  /**
   * 現在の進捗を栞として保存し、確認後に終了する
   */
  const handleSaveResume = async () => {
    if (!currentPhrase || !sectionId) return;

    const ok = await showConfirm(
      "Save & Exit?", 
      "現在の進捗をブックマークして、ダッシュボードに戻りますか？",
      { variant: 'info', isModal: false } // 保存はポジティブなアクションなので info
    );

    if (ok) {
      try {
        await saveResumeContent<WordResumeMetadata>(
          sectionId, 
          currentPhrase.phrase_id,
          {
            phrase_id: currentPhrase.phrase_id,
            word_id: currentWord.word_id,
            last_index: wordIdx,
          }
        );
        
        showToast("ブックマークしました", "success");
        router.push('/student/dashboard');
      } catch (error) {
        console.error("Failed to save resume point:", error);
        showToast("保存に失敗しました", "error");
      }
    }
  };

  /**
   * 自動再生の開始/停止
   */
  const toggleAutoPlay = async () => {
    if (isAutoPlaying) {
      setIsAutoPlaying(false);
      return;
    }

    const ok = await showConfirm(
      "Start Auto Play?",
      "自動再生を開始しますか？",
      { variant: 'info', isModal: false }
    );

    if (ok) {
      setIsAutoPlaying(true);
    }
  };

  /**
   * 自動再生中の音声再生
   */
  useEffect(() => {
    if (isAutoPlaying && currentPhrase && !isListening) {
      speak(currentPhrase.phrase_en);
    }
  }, [wordIdx, phraseIdx, isAutoPlaying, currentPhrase, isListening, speak]); // インデックスの変化だけを監視

  /**
   * 自動再生のループ制御
   */
  useEffect(() => {
    if (!isAutoPlaying || isSpeaking || isListening) return;

    // 読み上げが終わった（isSpeaking: false）タイミングでタイマー開始
    const timer = setTimeout(() => {
      const isLastPhrase = phraseIdx === (currentWord?.phrases.length || 0) - 1;
      const isLastWord = wordIdx === words.length - 1;

      if (isLastPhrase && isLastWord) {
        setIsAutoPlaying(false);
        showToast("最後のフレーズを再生しました", "success");
      } else {
        handleNext();
      }
    }, 1500); // 読み上げ後の純粋な待機時間

    return () => clearTimeout(timer);
  }, [isSpeaking, isListening, isAutoPlaying, phraseIdx, currentWord?.phrases.length, wordIdx, words.length, showToast, handleNext]); // 音声の状態を監視

  /**
   * 発話結果の解析
   */
  const analysis = useMemo(() => {
    // feedback がない、または必須のデータが揃っていない場合は null を返す
    if (!feedback || !currentPhrase || !currentWord) return null;
    
    return analyzePhrase(
      heardText || "", 
      currentPhrase.phrase_en, 
      [currentWord.word_en]
    );
  }, [feedback, heardText, currentPhrase, currentWord]);

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
    <div className="fixed inset-0 bg-[#f5f5f7] flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-8">

        {/* 1. アニメーションするアイコン */}
        <div className="relative w-20 h-20 mx-auto">
          {/* 外側の回転リング */}
          <div className="absolute inset-0 border-4 border-indigo-100 rounded-2xl"></div>
          <div className="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-2xl animate-spin"></div>
          {/* 中央のアイコン */}
          <div className="absolute inset-0 flex items-center justify-center text-indigo-600">
            <BookOpen size={32} className="animate-pulse" />
          </div>
        </div>

        {/* 2. テキストエリア */}
        <div className="space-y-3">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Preparing your session</h2>
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] animate-pulse">
              Loading Drill...
            </p>
            <div className="w-48 h-1 bg-slate-200 rounded-full overflow-hidden mt-2">
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
    </div>
  );

  // --- Render: Empty State (No Data) ---
  if (!currentWord || !currentPhrase) {
    return (
      <div className="fixed inset-0 bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white rounded-[40px] p-10 shadow-xl border border-slate-100 text-center space-y-8 animate-in zoom-in-95 duration-300">
          
          {/* 装飾アイコン */}
          <div className="relative w-24 h-24 mx-auto">
            <div className="absolute inset-0 bg-indigo-50 rounded-3xl rotate-6"></div>
            <div className="absolute inset-0 bg-white border-2 border-slate-100 rounded-3xl flex items-center justify-center text-slate-300 shadow-sm">
              <BookOpen size={40} strokeWidth={1.5} />
            </div>
            {/* 右上に小さなバツ印や注意マーク */}
            <div className="absolute -top-2 -right-2 bg-amber-400 text-white p-1.5 rounded-full border-4 border-white">
              <X size={14} strokeWidth={3} />
            </div>
          </div>

          {/* メッセージ */}
          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">No Content Yet</h2>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">
              この教材は現在準備中です。<br />
              他のライブラリをチェックしてみましょう。
            </p>
          </div>

          {/* アクションボタン */}
          <div className="pt-4 w-full">
            <button
              onClick={() => router.back()}
              className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-slate-200 hover:bg-indigo-600 hover:shadow-indigo-100 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <ChevronLeft size={18} strokeWidth={3} />
              Return to List
            </button>
            
            <p className="mt-6 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
              Content Update Pending
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    // 親コンテナをfixedにし、画面揺れ抑止
    <div className="fixed inset-0 bg-slate-50 flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden touch-none">
      {/* ドリルカード全体 h-full と max-w を調整し、画面内に必ず収まるようにする */}
      <div className="bg-white text-slate-900 rounded-4xl sm:rounded-[40px] p-5 sm:p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300 w-full max-w-2xl h-full max-h-225 flex flex-col relative overflow-hidden">
        
        {/* 音声認識フィードバック オーバーレイ */}
        {feedback && analysis && (
          <div 
            className="absolute inset-0 z-100 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" 
            onClick={() => {
                // ツールチップが開いていれば閉じる
                if (activeTooltipIndex !== -1) {
                  setActiveTooltipIndex(-1);
                } 
                // フィードバック自体を閉じる
                setFeedback(null);
            }}
          >
            <div 
              className="relative bg-white w-full max-w-sm rounded-4xl p-6 shadow-2xl flex flex-col items-center gap-6 animate-in zoom-in-95" 
              onClick={(e) => {
                  // バブリング抑止
                  e.stopPropagation()
                  // ツールチップが開いていれば閉じる
                  if (activeTooltipIndex !== -1) {
                    setActiveTooltipIndex(-1);
                  } 
              }}
            >
              {/* ヘッダーエリア：見出しと閉じるボタンを水平に配置 */}
              <div className="w-full flex justify-between items-center pb-1 mb-1">
                <h2 className="flex items-center gap-2 text-[12px] font-black text-slate-700 uppercase tracking-[0.2em]">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: feedback.fill }} />
                  発話結果
                </h2>
                <button onClick={() => setFeedback(null)} className="p-1 text-slate-300 hover:text-slate-500 transition-colors">
                  <X size={18} />
                </button>
              </div>
              
              {/* 円形プログレスと総合評価の二分割エリア */}
              <div className="flex items-start gap-4 w-full">
                {/* 左側：円形プログレス（スコアとタグを内包） */}
                <div className="relative w-28  h-28 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full -rotate-90">
                    <circle cx="56" cy="56" r="50" className="stroke-slate-100" strokeWidth="8" fill="none" />
                    <circle 
                      cx="56" cy="56" r="50" 
                      className="transition-all duration-1000 ease-out"
                      style={{ 
                        stroke: feedback.fill, 
                        strokeDasharray: 314, // 2 * PI * 50
                        strokeDashoffset: 314 - (314 * analysis.score)
                      }}
                      strokeWidth="8" fill="none" strokeLinecap="round" 
                    />
                  </svg>
                  {/* 中央のテキスト */}
                  <div className="absolute flex flex-col items-center">
                    <span className="text-[10px] font-black" style={{ color: feedback.fill }}>{feedback.tagText}</span>
                    <span className="text-2xl font-black text-slate-800" style={{ color: feedback.fill }}>{Math.round(analysis.score * 100)}</span>
                  </div>
                </div>

                {/* 垂直点線区切り */}
                <div className="h-24 w-px border-l border-dashed border-slate-300 mt-1" />

                {/* 右：評価タグと総合コメント */}
                <div className="flex-1 flex flex-col gap-1 mt-1">
                  <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
                    フィードバック
                  </span>
                  <p className="text-xs font-bold text-slate-700 leading-snug">
                    {analysis.summary}
                  </p>
                </div>
              </div>

              {/* 単語単位のフィードバックエリア */}
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-4 mt-1">
                {analysis.matches.map((m, idx) => {
                  // 「一致・不一致」と「ツールチップ表示条件」を定義
                  const isMissing = !m.isMatch;
                  // ヒントがある、または認識されなかった単語はタップ可能にする
                  const isTargetForTooltip = (m.isMatch && (m.isFuzzy || m.isCombined)) || isMissing;
                  const isVisible = activeTooltipIndex === idx;

                  // 2. スタイルの決定
                  let textColor = 'text-slate-800'; // デフォルトは黒
                  let decoration = '';              // デフォルトは装飾なし

                  if (isMissing) {
                    // 脱落単語のスタイル（ゴースト）
                    textColor = 'text-slate-300';
                    decoration = 'border-b-2 border-dashed border-slate-300';
                  } else if (m.isFuzzy) {
                    // 発音ミス（忖度）
                    textColor = 'text-orange-500';
                    decoration = 'underline decoration-wavy decoration-orange-300 underline-offset-8';
                  } else if (m.isCombined) {
                    // リンキング（忖度）
                    textColor = 'text-blue-500';
                    decoration = 'underline decoration-dotted decoration-blue-300 underline-offset-8';
                  }

                  return (
                    <div 
                      key={idx} 
                        className={`relative flex flex-col items-center select-none ${isTargetForTooltip ? 'cursor-pointer' : 'cursor-default'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isTargetForTooltip) {
                            setActiveTooltipIndex(isVisible ? -1 : idx);
                          }
                        }}
                        onMouseEnter={() => {
                            // ホバー可能なデバイス(マウス等)の場合のみ実行
                            if (window.matchMedia('(hover: hover)').matches) {
                              if (isTargetForTooltip) setActiveTooltipIndex(idx);
                            }
                          }}
                          onMouseLeave={() => {
                            if (window.matchMedia('(hover: hover)').matches) {
                              setActiveTooltipIndex(-1);
                            }
                          }}
                    >
                      {/* シンプルな対比ツールチップ */}
                      {isVisible && isTargetForTooltip && (
                        <div className="absolute -top-12 whitespace-nowrap px-3 py-2 bg-slate-900 text-white rounded-2xl shadow-xl z-30 animate-in zoom-in-50 duration-200">
                          <div className="flex items-center gap-2 text-[11px] font-bold">
                            {isMissing ? (
                              <span className="text-slate-200">聞き取れませんでした</span>
                            ) : (
                              <>
                                <span className="text-slate-400">{m.heard}</span>
                                <span className="text-slate-600">→</span>
                                <span className="text-sky-400">{m.word}</span>
                              </>
                            )}
                          </div>
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45" />
                        </div>
                      )}

                      <span className={`text-2xl font-bold transition-all ${textColor} ${decoration}`}>
                        {m.word}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* アドバイス ＆ フィードバックエリア */}
              <div className="flex flex-col gap-4">
                {/* 改善ポイント */}
                {analysis.issues.length > 0 && (
                  <div className="w-full bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider mb-2">改善のヒント</p>
                    <ul className="space-y-1.5">
                      {analysis.issues.map((issue, i) => (
                        <li key={i} className="flex items-start gap-2 text-[11px] text-slate-600 leading-tight">
                          <span className="text-slate-400 mt-0.5">•</span>
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
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
                        <div id={`section-head-${currentInitial}`} className="px-4 py-4 mt-2 mb-1 scroll-mt-4">
                          <span className="text-xl font-black text-indigo-200 italic tracking-tighter">
                            {currentInitial}
                          </span>
                          <div className="h-px w-full bg-slate-50 mt-1" />
                        </div>
                      )}

                      <button
                        ref={wordIdx === w.originalIdx ? activeWordRef : null}
                        onClick={() => jumpToWord(w.originalIdx)}
                        className={`w-full text-left px-4 py-3 rounded-2xl transition-all flex items-center gap-3 group ${
                          wordIdx === w.originalIdx 
                            ? 'bg-indigo-50 border border-indigo-100 ring-1 ring-indigo-100' 
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        {/* テキストコンテナ: flex-1 と min-w-0 で折り返しを有効に */}
                        <div className="flex-1 min-w-0 flex flex-col py-0.5">
                          <span className={`text-sm font-bold leading-tight wrap-break-word ${
                            wordIdx === w.originalIdx ? 'text-indigo-600' : 'text-slate-700'
                          }`}>
                            {sortOrder === 'default' ? `${w.originalIdx + 1}. ` : ''}{w.word_en}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400 mt-0.5 wrap-break-word">
                            {w.word_ja}
                          </span>
                        </div>
                        
                        {/* インジケーター: 右側に固定 */}
                        {wordIdx === w.originalIdx && (
                          <div className="shrink-0 w-1.5 h-1.5 bg-indigo-600 rounded-full animate-pulse" />
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
              {contentName || 'Business English Core'} 
            </span>
          </div>

          {/* 下段: 左に単語、右に進捗数 */}
          <div className="flex justify-between items-end gap-3">
            <div className="min-w-0 flex-1">
              {/* 語彙エリア（クリッカブル） */}
              <button 
                onClick={() => setShowIndex(true)} 
                className="group flex flex-col items-start transition-all -ml-2 px-2 py-1 rounded-2xl hover:bg-slate-50 text-left w-full sm:w-auto"
              >
                {/* 上段：語彙ラベル */}
                <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                  <List size={12} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em]">Vocabulary</span>
                </div>
                
                {/* 下段：単語とChevron */}
                <div className="flex items-start gap-2 w-full">
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-[1.1] wrap-break-word">
                    {currentWord.word_en}
                  </h1>
                  <ChevronDown 
                    size={18} 
                    className="shrink-0 text-slate-300 group-hover:text-indigo-500 group-hover:translate-y-0.5 transition-all mt-1" 
                  />
                </div>
              </button>
            </div>

            {/* 進捗表示 */}
            <div className="shrink-0 text-right bg-slate-50 px-3 py-1 rounded-xl border border-slate-100/50 mb-1 self-end">
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
                <span className="text-xs md:text-sm font-bold text-slate-500 italic truncate max-w-45 sm:max-w-none">
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
              <div className="flex items-center gap-2 animate-pulse text-rose-500">
                <div className="w-1.5 h-1.5 bg-current rounded-full" />
                <span className="text-xs font-black uppercase tracking-[0.2em]">Recording...</span>
              </div>
            ) : isAutoPlaying ? (
              <div className="flex items-center gap-2 text-indigo-600">
                <span className="text-xs font-black uppercase tracking-[0.3em] animate-pulse">Auto Playing Mode</span>
              </div>
            ) : (
              <p className="text-xs font-black text-slate-200 uppercase tracking-widest">
                Tap card to flip / Speak to check
              </p>
            )}
          </div>

        </div>

        {/* コントロール（ボタン）エリア */}
        <div className="shrink-0 space-y-3 pt-2 w-full flex flex-col items-center">
          
          {/* 上段：[栞] [   Next (メイン)   ] [自動] */}
          <div className="flex items-center gap-3 w-full max-w-sm px-2">
            {/* 栞ボタン：固定幅 */}
            <button 
              onClick={handleSaveResume}
              disabled={isAutoPlaying}
              className="shrink-0 w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 border border-slate-100 hover:bg-indigo-50 hover:text-indigo-600 transition-all active:scale-90 ${isAutoPlaying ? 'opacity-30 grayscale pointer-events-none' : ''}"
            >
              <Bookmark size={20} strokeWidth={2.5} />
            </button>

            {/* Nextボタン：可変幅（下のListen/Speakと端を揃える） */}
            <button 
              onClick={handleNext} 
              disabled={isListening || isAutoPlaying}
              className="flex-1 py-5 bg-indigo-600 text-white rounded-3xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-[0.2em] disabled:opacity-50"
            >
              {phraseIdx < (currentWord.phrases.length - 1) ? "Next Step" : "Next Word"}
              <ArrowRight size={16} strokeWidth={3} />
            </button>

            {/* 自動再生ボタン：固定幅 */}
            <button 
              onClick={toggleAutoPlay}
              className={`shrink-0 w-12 h-12 flex items-center justify-center rounded-2xl border transition-all active:scale-90 
                ${isAutoPlaying 
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' 
                  : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-indigo-50 hover:text-indigo-600'
                }`}
            >
              <RotateCw 
                size={20} 
                strokeWidth={2.5} 
                className={isAutoPlaying ? "animate-spin-slow" : ""} 
              />
            </button>
          </div>

          {/* 下段：[余白] [ Listen ] [ Speak ] [余白] */}
          <div className="flex items-center gap-3 w-full max-w-sm px-2">
            {/* 上のボタン幅(w-12)に合わせたスペーサー */}
            <div className="w-12 shrink-0" />

            {/* メインのサブアクション：Nextボタンと幅がピッタリ揃う */}
            <div className="flex-1 grid grid-cols-2 gap-3">
              <button 
                onClick={() => speak(currentPhrase.phrase_en)}
                disabled={isListening || isAutoPlaying}
                className="py-4 bg-slate-50 text-slate-400 rounded-3xl border border-slate-100 hover:bg-slate-100 hover:text-indigo-600 transition-all flex items-center justify-center disabled:opacity-50"
                title="Listen"
              >
                <Volume2 size={20} strokeWidth={2.5} />
              </button>
              
              <button 
                onClick={handleVoiceCheck} 
                disabled={isAutoPlaying}
                className={`relative py-3 w-full rounded-3xl flex items-center justify-center transition-all overflow-hidden 
                  ${isAutoPlaying ? 'opacity-30 grayscale pointer-events-none' : 'active:scale-95'}
                  ${isListening ? 'bg-rose-500 text-white shadow-lg' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={isListening ? "time" : "icon"}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.1 }}
                    className="relative z-10 font-black tabular-nums"
                  >
                    {isListening ? `${timeLeft}s` : <Mic size={20} strokeWidth={2.5} />}
                  </motion.div>
                </AnimatePresence>
              </button>
            </div>

            {/* 上のボタン幅(w-12)に合わせたスペーサー */}
            <div className="w-12 shrink-0" />
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