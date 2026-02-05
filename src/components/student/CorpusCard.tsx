'use client';

import { useState } from 'react';
import { Volume2, Mic, ChevronLeft } from 'lucide-react';
import { useVoice } from '@/hooks/useVoice';

export default function CorpusCard({ sectionId, onBack }: { sectionId: string, onBack: () => void }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const { speak, startListening, isListening } = useVoice();
  const [feedback, setFeedback] = useState<string | null>(null);

  const drills = [
    { text: "We supply substrates.", label: "STEP 1: CORE ACTION" },
    { text: "We supply SiC substrates for power modules.", label: "STEP 2: TECHNICAL DETAIL" },
  ];

  const current = drills[currentIdx];

  const handleNext = () => {
    setFeedback(null);
    setCurrentIdx((prev) => (prev + 1) % drills.length);
  };

  const handleVoiceCheck = () => {
    startListening((heard) => {
      const target = current.text.toLowerCase().replace(/[.,]/g, "");
      if (heard.toLowerCase().includes(target.split(" ")[0])) {
        setFeedback(`✓ Recognized: ${heard}`);
      } else {
        setFeedback(`× Try again: ${heard}`);
      }
    });
  };

  return (
    <div className="bg-white rounded-[36px] p-8 shadow-xl shadow-slate-200/50 border border-slate-100 space-y-8 animate-in zoom-in-95 duration-300">
      <div className="flex justify-between items-center">
        <button onClick={onBack} className="text-indigo-600 flex items-center text-sm font-medium hover:opacity-70">
          <ChevronLeft size={18} /> Scenarios
        </button>
        <span className="bg-slate-100 px-3 py-1 rounded-full text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          {sectionId}
        </span>
      </div>

      <div className="min-h-[160px] flex flex-col items-center justify-center text-center space-y-4">
        <div className="text-indigo-600 text-[10px] font-black tracking-[0.2em] uppercase">
          {current.label}
        </div>
        <div className="text-2xl md:text-3xl font-bold text-slate-800 leading-tight">
          {current.text}
        </div>
        {feedback && (
          <div className={`text-xs font-bold ${feedback.startsWith('✓') ? 'text-emerald-500' : 'text-rose-500'}`}>
            {feedback}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <button 
          onClick={handleNext}
          className="w-full py-5 bg-indigo-600 text-white rounded-[20px] font-bold shadow-lg shadow-indigo-200 hover:opacity-90 active:scale-[0.97] transition-all"
        >
          Next Pattern
        </button>
        
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => speak(current.text)}
            className="py-4 bg-slate-100 text-slate-700 rounded-[20px] font-bold flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors"
          >
            <Volume2 size={18} /> Listen
          </button>
          <button 
            onClick={handleVoiceCheck}
            disabled={isListening}
            className={`py-4 rounded-[20px] font-bold flex items-center justify-center gap-2 transition-all ${
              isListening ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-800 text-white hover:bg-slate-900'
            }`}
          >
            <Mic size={18} /> {isListening ? 'Listening...' : 'Record'}
          </button>
        </div>
      </div>
    </div>
  );
}