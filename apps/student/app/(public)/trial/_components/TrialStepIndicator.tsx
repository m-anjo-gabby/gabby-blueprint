import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TrialStep = 'input' | 'confirm' | 'done';

const STEPS: { key: TrialStep; label: string }[] = [
  { key: 'input', label: '入力' },
  { key: 'confirm', label: '確認' },
  { key: 'done', label: '完了' },
];

/** 申込の段階（入力 → 確認 → 完了）。あと何をすれば終わるかを見せる */
export function TrialStepIndicator({ current }: { current: TrialStep }) {
  const currentIndex = STEPS.findIndex((step) => step.key === current);
  return (
    <ol className="mb-8 flex items-center justify-center" aria-label="お申し込みの手順">
      {STEPS.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <li key={step.key} className="flex items-center" aria-current={isCurrent ? 'step' : undefined}>
            {index > 0 && <span className={cn('mx-2 h-px w-8 sm:w-12', index <= currentIndex ? 'bg-brand' : 'bg-line')} aria-hidden />}
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                  isCurrent && 'bg-brand text-white',
                  isDone && 'bg-brand-soft text-brand',
                  !isCurrent && !isDone && 'border border-line text-ink-subtle'
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" aria-label="済み" /> : index + 1}
              </span>
              <span className={cn('text-sm', isCurrent ? 'font-bold text-ink' : 'text-ink-muted')}>{step.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
