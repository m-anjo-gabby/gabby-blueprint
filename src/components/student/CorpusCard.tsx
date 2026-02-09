'use client';

import { useState, useEffect, useRef } from 'react';
import { Volume2, Mic, ChevronLeft, ArrowRight } from 'lucide-react';
import { useVoice } from '@/hooks/useVoice';
import { getTrainingData, type TrainingWord } from '@/actions/corpusAction';
import { calculateSimilarity } from '@/utils/stringSimilarity';

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
  
  const lastHeardRef = useRef<string>("");
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

  return (
    <div className="bg-white text-slate-900 rounded-[40px] p-8 shadow-2xl border border-slate-100 space-y-8 animate-in zoom-in-95 duration-300 max-w-2xl mx-auto min-h-[600px] flex flex-col relative overflow-hidden">
      
      {/* Header Area */}
      <div className="space-y-4 shrink-0">
        <div className="flex justify-start">
          <button onClick={onBack} className="group text-slate-400 hover:text-indigo-600 flex items-center text-[10px] font-black tracking-widest transition-all">
            <ChevronLeft size={14} className="mr-1 group-hover:-translate-x-0.5 transition-transform" /> 
            BACK TO DASHBOARD
          </button>
        </div>

        <div className="flex justify-between items-end border-b border-slate-50 pb-5">
          <div className="flex flex-col items-start space-y-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none">Vocabulary</span>
            <span className="text-xl font-black text-slate-900 leading-none tracking-tight">{currentWord.word_en}</span>
          </div>

          <div className="flex flex-col items-end space-y-1.5 text-right">
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] leading-none">
                 Step {currentPhrase.phrase_type}
               </span>
               <div className="flex gap-0.5">
                 {[1, 2, 3, 4, 5].map(s => (
                   <div key={s} className={`w-1 h-1 rounded-full ${s <= currentPhrase.phrase_type ? 'bg-indigo-600' : 'bg-slate-100'}`} />
                 ))}
               </div>
            </div>
            <span className="text-[11px] font-bold text-slate-500 italic leading-none">
              {getStepLabel(currentPhrase.phrase_type).split(': ')[1]}
            </span>
          </div>
        </div>
      </div>

      {/* Main Drill Area */}
      <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
        <div className="space-y-12 w-full max-w-lg">
          
          {/* ターゲット英文: 常に主役として中央に配置 */}
          <div className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight leading-[1.2] transition-all">
            {currentPhrase.phrase_en}
          </div>
          
          {/* 情報表示エリア: 固定の高さを確保してガタつきを防止 */}
          <div className="h-24 flex flex-col items-center justify-start">
            
            {/* 録音中: 認識テキストを「思考の断片」のように表示 */}
            {isListening && (
              <div className="flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex gap-1.5 h-3 items-center">
                  {[...Array(3)].map((_, i) => (
                    <div 
                      key={i} 
                      className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" 
                      style={{ animationDelay: `${i * 0.15}s` }} 
                    />
                  ))}
                </div>
                <p className="text-xl font-medium text-slate-400 italic tracking-wide leading-relaxed px-4">
                  {heardText || "Listening..."}
                </p>
              </div>
            )}

            {/* 録音終了後: 評価結果を洗練されたバッジで表示 */}
            {/* 録音終了後: 評価結果と「認識の記録」を表示 */}
            {!isListening && feedback && (
              <div className="flex flex-col items-center gap-5 animate-in zoom-in-95 fade-in duration-500">
                
                {/* 評価バッジ */}
                <div className="flex flex-col items-center gap-2">
                  <div 
                    className={`text-[10px] font-black px-8 py-2 rounded-full border uppercase tracking-[0.3em] shadow-sm ${feedback.text}`}
                    style={{ 
                      backgroundColor: `${feedback.fill}08`, 
                      borderColor: `${feedback.fill}30`,
                      color: feedback.fill 
                    }}
                  >
                    {feedback.tagText}
                  </div>
                </div>

                {/* 認識されたテキスト: ユーザーへのフィードバックとして非常に重要 */}
                <div className="flex flex-col items-center gap-1.5 px-6">
                  <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">You said</span>
                  <p className="text-base font-medium text-slate-500 italic leading-relaxed max-w-sm">
                    {heardText || " (No speech detected) "}
                  </p>
                </div>

                {/* 次への案内: 視覚的な区切り線を入れる */}
                <div className="w-8 h-px bg-slate-100" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-4 shrink-0">
        {/* NEXT ボタン: 発話中は無効化 */}
        <button 
          onClick={handleNext} 
          disabled={isListening}
          className="w-full py-6 bg-indigo-600 text-white rounded-[28px] font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all flex items-center justify-center gap-2 uppercase tracking-wide text-sm"
        >
          {phraseIdx < (currentWord?.phrases?.length ?? 0) - 1 ? "Next Step" : "Next Word"}
          <ArrowRight size={18} />
        </button>

        <div className="grid grid-cols-2 gap-4">
          {/* LISTEN ボタン: 発話中は無効化 */}
          <button 
            onClick={() => speak(currentPhrase.phrase_en)}
            disabled={isListening}
            className="py-5 bg-slate-50 text-slate-700 rounded-[28px] font-bold flex items-center justify-center gap-3 border border-slate-200/50 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm uppercase"
          >
            <Volume2 size={18} className="text-indigo-600" /> Listen
          </button>

          {/* SPEAK ボタン: これはトグル(停止用)として使うため、常に有効 */}
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