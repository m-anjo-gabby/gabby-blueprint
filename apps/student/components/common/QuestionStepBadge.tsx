'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface QuestionStepBadgeProps {
  /** 表示する問題番号（グループ番号など、フォーマット済みの値をそのまま渡す） */
  questionNumber: string | number;
  /** バッジ右側に表示する内容（Step X/Y、YES/NOで回答 等）。未指定時は番号のみ表示 */
  rightSlot?: React.ReactNode;
  className?: string;
}

/**
 * スプリント／ドリル共通の「Question番号 + Step」バッジ。
 * SprintTimePlayer と QuestionCard で見た目・マークアップが重複していたため共通化。
 */
export const QuestionStepBadge: React.FC<QuestionStepBadgeProps> = ({
  questionNumber,
  rightSlot,
  className,
}) => (
  <div
    className={cn(
      'flex items-center bg-indigo-600 rounded-[14px] shadow-sm overflow-hidden border border-indigo-600',
      className,
    )}
  >
    <div className="flex items-center gap-2.5 px-3 py-1.5">
      <span className="text-[10px] font-black text-indigo-200 uppercase tracking-[0.2em] leading-none whitespace-nowrap">
        Question
      </span>
      <span className="text-sm font-black text-white font-mono leading-none whitespace-nowrap">
        {questionNumber}
      </span>
    </div>

    {rightSlot && (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white border-l border-indigo-600 self-stretch">
        {rightSlot}
      </div>
    )}
  </div>
);

interface StepIndicatorProps {
  current: number;
  total: number;
}

/** QuestionStepBadge の rightSlot に渡す「Step X / Y」表示 */
export const StepIndicator: React.FC<StepIndicatorProps> = ({ current, total }) => (
  <>
    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none whitespace-nowrap">
      Step
    </span>
    <span className="text-xs font-bold text-indigo-600 font-mono leading-none whitespace-nowrap">
      {current} <span className="text-slate-300 mx-0.5">/</span> {total}
    </span>
  </>
);
