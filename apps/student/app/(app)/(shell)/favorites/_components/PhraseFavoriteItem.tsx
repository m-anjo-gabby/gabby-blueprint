'use client';

import { motion } from 'framer-motion';
import { Volume2, Trash2, BookOpen, Music4, Mic } from 'lucide-react';
import { FavoritePhraseItem } from '@gabby/types/word';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { useWebSpeech } from '@gabby/lib/hooks/useWebSpeech';
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Props {
  phrase: FavoritePhraseItem;
  onRemove: (id: string) => void;
}

export function PhraseFavoriteItem({ phrase, onRemove }: Props) {
  // 音声ファイル再生用フック
  const { play, isPlaying: isAudioPlaying } = usePlayAudioSpeech();
  // ブラウザTTS再生用フック
  const { speak, isSpeaking } = useWebSpeech();

  const handleSpeak = (p: FavoritePhraseItem) => {
    window.speechSynthesis.cancel();
    if (p.audio_path && p.tts_status === 1) {
      play(p.audio_path, p.phrase_id, { restart: true });
    } else {
      speak(p.phrase_en);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="mb-4 last:mb-0"
    >
      <Card className="group overflow-hidden transition-all duration-300 rounded-[28px] bg-white border-slate-100 shadow-sm hover:shadow-md">
        
        {/* 1. Header Area: 教材ラベルを表示 */}
        <div className="px-5 py-3 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-400">
            <BookOpen size={12} strokeWidth={2.5} className="text-indigo-400" />
            <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[220px]">
              {phrase.content_name}
            </span>
          </div>
          {/* アクセント：少し学習感のあるバッジ的要素 */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:flex">
             <span className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">ID: {phrase.phrase_id.slice(0, 6)}</span>
          </div>
        </div>

        {/* 2. Main Content Area: フレーズを横いっぱいに表示 */}
        <CardContent className="p-6">
          <div className="space-y-2">
            <h3 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight leading-tight decoration-indigo-100 decoration-2">
              {phrase.phrase_en}
            </h3>
            <p className="text-sm sm:text-base text-slate-500 font-bold leading-relaxed">
              {phrase.phrase_ja}
            </p>
          </div>
        </CardContent>

        {/* 3. Footer Area: 操作系を下に配置（iPhoneでの押しやすさを重視） */}
        <CardFooter className="px-4 pb-4 pt-0 flex items-center gap-2">
          {/* Listenボタン：横幅を広くとって押しやすく */}
          <Button
            variant="secondary"
            onClick={() => handleSpeak(phrase)}
            className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border-none rounded-2xl h-11 font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 group/btn"
          >
            {isAudioPlaying === phrase.phrase_id
              ? <Music4 size={16} strokeWidth={2.5} className="mr-2 animate-pulse text-indigo-500" />
              : isSpeaking
                ? <Mic size={16} strokeWidth={2.5} className="mr-2 animate-pulse text-indigo-500" />
                : <Volume2 size={16} strokeWidth={2.5} className="mr-2 group-hover/btn:animate-pulse" />
            }
            Listen Now
          </Button>

          {/* Removeボタン：誤操作しにくいがアクセスしやすい位置 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemove(phrase.phrase_id)}
            className="w-11 h-11 rounded-2xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all active:scale-90"
            title="Remove from favorites"
          >
            <Trash2 size={18} strokeWidth={2.5} />
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}