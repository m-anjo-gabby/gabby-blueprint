'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FavoriteOnlyToggleProps {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}

/**
 * 教材一覧の「お気に入りだけ表示」の切り替え（検索欄の横に置く）。
 * 種別タブ（どれか1つを選ぶ）と組み合わせて使う条件のため、種別タブには混ぜずオン・オフのボタンにする。
 * ☆の色は教材カードのお気に入りの☆と揃える。
 */
export function FavoriteOnlyToggle({ pressed, onPressedChange }: FavoriteOnlyToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        'flex h-12 shrink-0 items-center gap-1.5 rounded-control border px-3 text-sm font-semibold transition-colors active:scale-95',
        pressed
          ? 'border-brand-200 bg-brand-soft text-brand-strong'
          : 'border-line bg-surface text-ink-soft hover:bg-canvas'
      )}
    >
      <Star size={16} fill={pressed ? 'currentColor' : 'none'} className={pressed ? 'text-amber-500' : 'text-ink-subtle'} />
      お気に入り
    </button>
  );
}
