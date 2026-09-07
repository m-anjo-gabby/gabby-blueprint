'use client';

import { cn } from '@/lib/utils';
import { LESSON_SPRINT_SCORE_META, DEFAULT_LESSON_SPRINT_SCORE } from '@gabby/types/lessonSprint';

interface Props {
  onScore: (score: number) => void;
  disabled?: boolean;
}

const SCORES = [1, 2, 3, 4, 5];

export function ScoreButtons({ onScore, disabled }: Props) {
  return (
    <div className="grid grid-cols-5 gap-2 w-full max-w-lg mx-auto">
      {SCORES.map((score) => {
        const meta = LESSON_SPRINT_SCORE_META[score];
        const isDefault = score === DEFAULT_LESSON_SPRINT_SCORE;
        return (
          <button
            key={score}
            type="button"
            disabled={disabled}
            onClick={() => onScore(score)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 h-20 rounded-2xl border-2 font-black transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
              isDefault ? 'border-amber-300' : 'border-transparent'
            )}
            style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
          >
            <span className="text-2xl leading-none">{score}</span>
            <span className="text-[9px] uppercase tracking-wide leading-none whitespace-nowrap">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}
