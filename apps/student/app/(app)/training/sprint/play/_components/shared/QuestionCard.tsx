'use client';

import React, { useEffect, useRef, useState } from 'react';
import { SprintQuestion } from '@gabby/types/sprint';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QuestionCardProps {
  question: SprintQuestion;
  speedAnswerType?: 'yes' | 'no'; 
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  speedAnswerType = 'yes',
}) => {
  // 💡 状態の初期値は常に false
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isSpeed = question.question_type === '0';

  const currentVoiceUrl = isSpeed
    ? (speedAnswerType === 'no' ? question.answer_sentence_no_voice : question.answer_sentence_yes_voice)
    : question.question_voice || question.statement_voice;

  // 🔄 オーディオのライフサイクル管理用エフェクト
  useEffect(() => {
    // 1. 既存の古いオーディオインスタンスを安全に停止・クリーンアップ
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // 🚀 修正ポイント: エフェクトの地平（トップレベル）では一切 setIsPlaying を呼ばない！
    // 状態変更はすべて、以下の非同期イベントハンドラーの中に完全に閉じ込めます。

    if (currentVoiceUrl) {
      const audio = new Audio(currentVoiceUrl);
      
      // すべて非同期で発火するコールバックなので、カスケードレンダリングエラーになりません
      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => setIsPlaying(false);
      audio.onpause = () => setIsPlaying(false);
      audio.onerror = () => {
        console.error('Audio playback failed:', currentVoiceUrl);
        setIsPlaying(false);
      };
      
      audioRef.current = audio;

      // 自動再生トリガー
      audio.play().catch((err) => {
        console.log('Autoplay blocked or interrupted:', err);
        // オートプレイがブラウザに弾かれた（まだ画面クリックがない等）場合は、
        // すでに状態は初期値の false なので、ここではあえて何もしない（setStateを呼ばない）
      });
    }

    // クリーンアップ関数
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [currentVoiceUrl, question.question_id, speedAnswerType]);

  // 手動再生・停止トグル
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((err) => console.error(err));
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-card text-card-foreground border rounded-3xl p-6 md:p-8 shadow-sm flex flex-col items-center gap-6">
      {/* 🔊 音声コントロールセクション */}
      {currentVoiceUrl && (
        <Button
          variant={isPlaying ? 'default' : 'secondary'}
          size="icon"
          onClick={togglePlay}
          className="w-16 h-16 rounded-full shadow-md transition-transform active:scale-95"
        >
          {isPlaying ? <VolumeX className="w-7 h-7 animate-pulse" /> : <Volume2 className="w-7 h-7" />}
        </Button>
      )}

      {/* 📝 テキスト表示セクション */}
      <div className="w-full flex flex-col gap-4 text-center mt-2">
        {!isSpeed && question.statement && (
          <p className="text-sm md:text-base text-muted-foreground font-medium tracking-wide border-b pb-3 border-dashed">
            {question.statement}
          </p>
        )}

        <h2 className="text-xl md:text-2xl font-bold leading-relaxed tracking-tight text-foreground min-h-[3.5rem] flex items-center justify-center px-4">
          {question.question}
        </h2>
      </div>

      {/* 🔢 進捗ステップ数 */}
      {!isSpeed && (
        <span className="text-xs bg-muted text-muted-foreground px-3 py-1 rounded-full font-mono font-bold">
          Step {question.seq_no}
        </span>
      )}
    </div>
  );
};