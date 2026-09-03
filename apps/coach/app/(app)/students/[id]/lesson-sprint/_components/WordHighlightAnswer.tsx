'use client';

import { cn } from '@/lib/utils';

interface Props {
  words: string[];
  highlighted: number[];
  onToggle: (index: number) => void;
}

/**
 * 解答文を単語単位でクリック可能にし、クリックした単語をハイライト表示する。
 * 生徒の発音・脱落フィードバック用にコーチが記録するためのUI。
 */
export function WordHighlightAnswer({ words, highlighted, onToggle }: Props) {
  return (
    <div className="flex flex-wrap gap-x-1 gap-y-1.5 justify-center">
      {words.map((word, idx) => {
        const isHighlighted = highlighted.includes(idx);
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onToggle(idx)}
            className={cn(
              'px-1 py-0.5 rounded-lg text-lg sm:text-xl font-black transition-colors cursor-pointer select-none',
              isHighlighted
                ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-300'
                : 'text-slate-800 hover:bg-slate-100'
            )}
          >
            {word}
          </button>
        );
      })}
    </div>
  );
}
