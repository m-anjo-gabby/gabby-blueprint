'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { Star } from 'lucide-react';
import { cn } from '../../utils';
import { roundRatingToHalf } from '../../coachRating/format';

const STAR_COUNT = 5;
const STARS = Array.from({ length: STAR_COUNT }, (_, i) => i + 1);

/** 星1つ。fill は 0〜1（0.5 で左半分だけ塗る） */
function StarGlyph({ fill, size }: { fill: number; size: number }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <Star size={size} strokeWidth={0} className="absolute inset-0 fill-slate-200" />
      {fill > 0 && (
        <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
          <Star size={size} strokeWidth={0} className="fill-gold" />
        </span>
      )}
    </span>
  );
}

export interface StarRatingDisplayProps {
  /** 平均点（1〜5）。0.5刻みに丸めて塗る */
  value: number;
  size?: number;
  /** 読み上げ用の文言（例: 「5点満点中4.3点」）。言語はアプリ側で渡す */
  label: string;
  className?: string;
}

/** 星の表示（読み取り専用）。平均点を0.5刻みに丸めて塗る */
export function StarRatingDisplay({ value, size = 16, label, className }: StarRatingDisplayProps) {
  const rounded = roundRatingToHalf(value);
  return (
    <span role="img" aria-label={label} className={cn('inline-flex items-center gap-0.5', className)}>
      {STARS.map((n) => (
        <StarGlyph key={n} fill={Math.min(Math.max(rounded - (n - 1), 0), 1)} size={size} />
      ))}
    </span>
  );
}

export interface StarRatingInputProps {
  /** 選んだ点数（未選択は null） */
  value: number | null;
  onChange: (value: number) => void;
  /** グループの読み上げ用の名前（評価項目名） */
  label: string;
  /** 各星の読み上げ用の文言（例: n => `${n}点`） */
  getOptionLabel: (value: number) => string;
  size?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * 星1〜5の入力。ラジオボタンのグループとして振る舞う（Tab で入り、矢印キーで選ぶ）。
 * マウスを重ねた星までを仮に塗って見せる。
 */
export function StarRatingInput({ value, onChange, label, getOptionLabel, size = 32, disabled = false, className }: StarRatingInputProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = hovered ?? value ?? 0;
  // 未選択のときは1つ目の星だけを Tab で選べるようにする
  const focusable = value ?? 1;

  const select = (next: number) => {
    onChange(next);
    buttonRefs.current[next - 1]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      select(Math.min(current + 1, STAR_COUNT));
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      select(Math.max(current - 1, 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      select(1);
    } else if (event.key === 'End') {
      event.preventDefault();
      select(STAR_COUNT);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cn('inline-flex items-center gap-1', className)}
      onMouseLeave={() => setHovered(null)}
    >
      {STARS.map((n) => (
        <button
          key={n}
          ref={(el) => {
            buttonRefs.current[n - 1] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={getOptionLabel(n)}
          tabIndex={n === focusable ? 0 : -1}
          disabled={disabled}
          onClick={() => select(n)}
          onKeyDown={(event) => handleKeyDown(event, n)}
          onMouseEnter={() => setHovered(n)}
          className="rounded-md p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:pointer-events-none disabled:opacity-60"
        >
          <StarGlyph fill={n <= shown ? 1 : 0} size={size} />
        </button>
      ))}
    </div>
  );
}
