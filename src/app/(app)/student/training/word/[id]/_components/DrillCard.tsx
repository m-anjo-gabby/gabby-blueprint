'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star } from 'lucide-react';
import { PHRASE_TYPES, PhraseType } from '@/types/word';
import { useWordDrillStore } from '@/stores/useWordDrillStore';

interface DrillCardProps {
  onToggleFavorite: (phraseId: string, currentState: boolean) => void;
}

export const DrillCard: React.FC<DrillCardProps> = ({ onToggleFavorite }) => {
  // Store から必要なデータとアクションを抽出
  const words = useWordDrillStore((state) => state.words);
  const wordIdx = useWordDrillStore((state) => state.wordIdx);
  const phraseIdx = useWordDrillStore((state) => state.phraseIdx);
  const isFlipped = useWordDrillStore((state) => state.isFlipped);
  const toggleFlip = useWordDrillStore((state) => state.toggleFlip);

  const currentWord = words[wordIdx];
  const phrase = currentWord?.phrases[phraseIdx];

  if (!phrase) return <div className="flex-1 w-full animate-pulse bg-slate-50 rounded-3xl" />;

  const getStepLabel = (type: number): string => {
    const step = PHRASE_TYPES[type as PhraseType];
    return step ? step.label : "TRAINING";
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center py-2 sm:py-4 w-full">
      {/* ステップ・お気に入りエリア */}
      <div className="w-full shrink-0 flex flex-col items-center mb-6 sm:mb-10">
        {/* ドット進捗 */}
        <div className="flex gap-2.5 mb-5 sm:mb-6">
          {currentWord.phrases.map((p, i) => (
            <div 
              key={p.phrase_id} 
              className={`w-2 h-2 rounded-full transition-all duration-700 ${
                i <= phraseIdx ? 'bg-indigo-600 scale-125 shadow-[0_0_8px_rgba(79,70,229,0.4)]' : 'bg-slate-200'
              }`} 
            />
          ))}
        </div>

        <div className="w-full flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-black text-white bg-indigo-600 px-2.5 py-1 rounded-md tracking-wider">
              STEP {phrase.phrase_type}
            </span>
            <span className="text-xs md:text-sm font-bold text-slate-500 italic truncate max-w-[180px]">
              {getStepLabel(phrase.phrase_type)}
            </span>
          </div>
          <button 
            onClick={() => onToggleFavorite(phrase.phrase_id, phrase.is_favorite)} 
            className={`p-1 transition-all active:scale-75 hover:scale-110 ${
              phrase.is_favorite ? 'text-amber-400' : 'text-slate-200 hover:text-slate-300'
            }`}
          >
            <Star size={28} fill={phrase.is_favorite ? "currentColor" : "none"} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Flip Card */}
      <div className="w-full flex-1 min-h-0 flex items-center justify-center relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${phrase.phrase_id}`} // IDが変わるたびにアニメーション
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-full h-full flex items-center justify-center perspective-1000"
            onClick={toggleFlip}
          >
            <div className={`relative w-full h-full max-h-64 transition-all duration-500 preserve-3d cursor-pointer ${
              isFlipped ? 'rotate-y-180' : ''
            }`}>
              {/* Front: English */}
              <div className="absolute inset-0 backface-hidden flex items-center justify-center text-center p-4 bg-white">
                <p className="text-3xl md:text-4xl font-black text-slate-900 leading-tight break-words">
                  {phrase.phrase_en}
                </p>
              </div>
              {/* Back: Japanese */}
              <div className="absolute inset-0 backface-hidden rotate-y-180 flex items-center justify-center text-center p-4 bg-white">
                <p className="text-2xl md:text-3xl font-bold text-indigo-600 leading-relaxed break-words">
                  {phrase.phrase_ja}
                </p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};