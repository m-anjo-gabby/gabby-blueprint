'use client';

import { useState, useEffect, useRef } from 'react';
import { Volume2, Mic, ChevronLeft, ArrowRight } from 'lucide-react';
import { useVoice } from '@/hooks/useVoice';
import { getTrainingData, type TrainingWord } from '@/actions/corpusAction';

export default function CorpusCard({ sectionId, onBack }: { sectionId: string, onBack: () => void }) {
  const [words, setWords] = useState<TrainingWord[]>([]);
  const [wordIdx, setWordIdx] = useState(0);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const [heardText, setHeardText] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; isSuccess: boolean } | null>(null);
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
      const target = currentPhrase.phrase_en.toLowerCase().replace(/[.,?]/g, "");
      const isOk = lastHeardRef.current.toLowerCase().includes(target.split(" ")[0]); 
      
      setFeedback({
        text: isOk ? "Correct!" : "Try Again",
        isSuccess: isOk
      });
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
        <div className="space-y-8 w-full">
          <div className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight leading-[1.15] min-h-[3em] flex items-center justify-center">
            {currentPhrase.phrase_en}
          </div>
          
          <div className="min-h-20 flex flex-col items-center justify-center gap-3">
            {heardText && (
              <div className="text-lg font-medium text-slate-500 italic animate-in fade-in slide-in-from-bottom-2">
                &quot;{heardText}&quot;
              </div>
            )}
            
            {feedback && (
              <div className={`text-xs font-black px-6 py-2 rounded-full animate-in zoom-in-95 duration-300 ${
                feedback.isSuccess ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'
              }`}>
                {feedback.text}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-4 shrink-0">
        <button 
          onClick={handleNext}
          className="w-full py-6 bg-indigo-600 text-white rounded-[28px] font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {phraseIdx < (currentWord?.phrases?.length ?? 0) - 1 ? "NEXT STEP" : "NEXT WORD"}
          <ArrowRight size={20} />
        </button>
        
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => speak(currentPhrase.phrase_en)}
            className="py-5 bg-slate-50 text-slate-700 rounded-[28px] font-bold flex items-center justify-center gap-3 border border-slate-200/50"
          >
            <Volume2 size={20} className="text-indigo-600" /> LISTEN
          </button>
          
          <button 
            onClick={handleVoiceCheck}
            className={`relative py-5 rounded-[28px] font-bold flex items-center justify-center gap-3 transition-all overflow-hidden ${
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
              <Mic size={20} className={isListening ? 'animate-pulse' : ''} />
              <span>{isListening ? `${timeLeft}s STOP` : 'SPEAK'}</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}