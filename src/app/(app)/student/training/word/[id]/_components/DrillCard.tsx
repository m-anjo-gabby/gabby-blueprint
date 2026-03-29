'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PHRASE_TYPES, PhraseType } from '@/types/word';
import { useWordDrillStore } from '@/stores/useWordDrillStore';

interface DrillCardProps {
  onToggleFavorite: (phraseId: string, currentState: boolean) => void;
}

export const DrillCard: React.FC<DrillCardProps> = ({ onToggleFavorite }) => {
  const { words, wordIdx, phraseIdx, isFlipped, toggleFlip } = useWordDrillStore();
  
  const currentWord = words[wordIdx];
  const phrase = currentWord?.phrases[phraseIdx];

  // データ不在時のフォールバック
  if (!phrase) return <div className="flex-1 w-full animate-pulse bg-slate-50/50 rounded-[40px]" />;

  const totalSteps = currentWord.phrases.length;

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full relative">
      
      {/* 1. Favorite Button: 押しやすさを考慮しつつ右上に配置 */}
      <div className="absolute top-4 right-4 md:right-8 z-20">
        <button
          onClick={(e) => { 
            e.stopPropagation(); 
            onToggleFavorite(phrase.phrase_id, phrase.is_favorite); 
          }}
          className={cn(
            "transition-all active:scale-75 p-2.5 rounded-full flex items-center justify-center",
            phrase.is_favorite 
              ? "text-amber-500 bg-amber-50" // ContentCardのON状態と完全同期
              : "text-slate-300 hover:bg-slate-100/50" // OFF状態
          )}
        >
          <motion.div
            key={phrase.is_favorite ? 'fav-on' : 'fav-off'}
            initial={{ scale: 1 }}
            animate={phrase.is_favorite ? { scale: [1, 1.2, 1] } : { scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Star 
              size={20} // ContentCard(18)より少しだけ大きくして学習中の操作性をUP
              fill={phrase.is_favorite ? "currentColor" : "none"} 
              strokeWidth={phrase.is_favorite ? 2 : 2.5} 
            />
          </motion.div>
        </button>
      </div>

      {/* 2. Step Badge Section: Headerのレール位置(px-8)と完全に同期 */}
      <div className="w-full shrink-0 flex flex-col items-start mt-4 mb-2 pt-1 px-8"> 
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-tighter">
            Step {phrase.phrase_type}
          </span>
          
          <div className="w-[1px] h-3 bg-slate-200" />

          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider truncate max-w-[140px]">
            {PHRASE_TYPES[phrase.phrase_type as PhraseType]?.label}
          </span>
        </div>

        {/* 分割プログレスバー: 左寄せにすることでHeaderの進捗と視覚的にリンク */}
        <div 
          className="grid gap-1 w-32" 
          style={{ gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }}
        >
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className="h-[3px] bg-slate-100 rounded-full overflow-hidden relative">
              <motion.div
                initial={false}
                animate={{ x: i <= phraseIdx ? "0%" : "-100%" }}
                transition={{ duration: 0.4, ease: "circOut" }}
                className="absolute inset-0 bg-indigo-500 shadow-[0_0_4px_rgba(99,102,241,0.2)]"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 3. Card Surface: ユーザーが最も触れるエリア */}
      <div 
        className="w-full flex-1 flex items-center justify-center perspective-1000 relative select-none px-4" 
        onClick={toggleFlip}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`${phrase.phrase_id}-${wordIdx}`} // 単語切り替え時もアニメーションをトリガー
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full"
          >
            <div className={cn(
              "w-full h-full transition-all duration-700 preserve-3d cursor-pointer rounded-[40px]",
              isFlipped ? "rotate-y-180" : ""
            )}>
              {/* Front: English (高い視認性を確保) */}
              <div className="absolute inset-0 backface-hidden flex items-center justify-center text-center p-6">
                <p className="text-3xl sm:text-4xl font-black text-slate-800 leading-[1.15] tracking-tighter antialiased">
                  {phrase.phrase_en}
                </p>
              </div>

              {/* Back: Japanese (英語とのコントラストをつけるためIndigo色を採用) */}
              <div className="absolute inset-0 backface-hidden rotate-y-180 flex items-center justify-center text-center p-6">
                <p className="text-2xl sm:text-3xl font-black text-indigo-600 leading-[1.15] tracking-tighter antialiased">
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