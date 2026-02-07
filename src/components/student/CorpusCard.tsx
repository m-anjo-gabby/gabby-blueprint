'use client';

import { useState, useEffect } from 'react';
import { Volume2, Mic, ChevronLeft, ArrowRight, BookOpen } from 'lucide-react';
import { useVoice } from '@/hooks/useVoice';
import { getTrainingData, type TrainingWord } from '@/actions/corpusAction';

export default function CorpusCard({ sectionId, onBack }: { sectionId: string, onBack: () => void }) {
  const [words, setWords] = useState<TrainingWord[]>([]);
  const [wordIdx, setWordIdx] = useState(0);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ text: string; isSuccess: boolean } | null>(null);
  
  const { speak, startListening, isListening } = useVoice();

  // データ取得
  useEffect(() => {
    async function init() {
      const data = await getTrainingData(sectionId);
      setWords(data);
      setLoading(false);
    }
    init();
  }, [sectionId]);

  if (loading) return <div className="p-20 text-center animate-pulse text-primary">Loading Drill...</div>;
  if (words.length === 0) return <div className="p-20 text-center">No data found.</div>;

  const currentWord = words[wordIdx];
  const currentPhrase = currentWord.phrases[phraseIdx];

  // フレーズタイプのラベル変換
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

  const handleNext = () => {
    setFeedback(null);
    if (phraseIdx < currentWord.phrases.length - 1) {
      setPhraseIdx(prev => prev + 1);
    } else {
      // 次の単語へ
      setPhraseIdx(0);
      setWordIdx(prev => (prev + 1) % words.length);
    }
  };

  const handleVoiceCheck = () => {
    startListening((heard) => {
      const target = currentPhrase.phrase_en.toLowerCase().replace(/[.,?]/g, "");
      const isOk = heard.toLowerCase().includes(target.split(" ")[0]); // 簡易判定
      setFeedback({
        text: isOk ? `✓ Good job: ${heard}` : `× Try again: ${heard}`,
        isSuccess: isOk
      });
    });
  };

  return (
    <div className="bg-card text-card-foreground rounded-[40px] p-8 shadow-2xl border border-border space-y-8 animate-in zoom-in-95 duration-300 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center">
        <button onClick={onBack} className="text-primary flex items-center text-sm font-bold hover:opacity-70 transition-all">
          <ChevronLeft size={20} className="mr-1" /> Back
        </button>
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Vocabulary</span>
          <span className="text-sm font-bold text-foreground">{currentWord.word_en}</span>
        </div>
      </div>

      {/* Main Drill Area */}
      <div className="min-h-[220px] flex flex-col items-center justify-center text-center space-y-6 px-4">
        <div className="px-4 py-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-black tracking-widest uppercase">
          {getStepLabel(currentPhrase.phrase_type)}
        </div>
        
        <div className="space-y-4">
          <div className="text-2xl md:text-4xl font-extrabold tracking-tight leading-tight">
            {currentPhrase.phrase_en}
          </div>
          {/* 日本語表記は表示しない */}
          {/* <div className="text-base md:text-lg text-muted-foreground font-medium opacity-80">
            {currentPhrase.phrase_ja}
          </div> */}
        </div>

        {feedback && (
          <div className={`text-sm font-bold px-4 py-2 rounded-xl animate-bounce ${feedback.isSuccess ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
            {feedback.text}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-4">
        <button 
          onClick={handleNext}
          className="w-full py-6 bg-primary text-background rounded-[24px] font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
        >
          {phraseIdx < currentWord.phrases.length - 1 ? "Next Step" : "Next Word"}
          <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
        </button>
        
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => speak(currentPhrase.phrase_en)}
            className="py-5 bg-muted/50 text-foreground rounded-[24px] font-bold flex items-center justify-center gap-3 hover:bg-muted transition-colors border border-border/50"
          >
            <Volume2 size={22} className="text-primary" /> Listen
          </button>
          <button 
            onClick={handleVoiceCheck}
            disabled={isListening}
            className={`py-5 rounded-[24px] font-bold flex items-center justify-center gap-3 transition-all ${
              isListening ? 'bg-rose-500 text-white animate-pulse' : 'bg-foreground text-background hover:opacity-90'
            }`}
          >
            <Mic size={22} /> {isListening ? '...' : 'Speak'}
          </button>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="pt-4 flex gap-1 justify-center">
        {currentWord.phrases.map((_, idx) => (
          <div 
            key={idx}
            className={`h-1.5 rounded-full transition-all duration-500 ${idx === phraseIdx ? 'w-8 bg-primary' : 'w-2 bg-border'}`}
          />
        ))}
      </div>
    </div>
  );
}