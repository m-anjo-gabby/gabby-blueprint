import { Target } from 'lucide-react';

interface ProfileCompletionMeterProps {
  percent: number;
  missingLabels: string[];
}

/** Public Coach Profileの入力充実度を示すゲージ。ライブプレビュー欄の上部に表示する */
export function ProfileCompletionMeter({ percent, missingLabels }: ProfileCompletionMeterProps) {
  const helperText =
    missingLabels.length === 0
      ? 'Your public profile is fully filled in.'
      : `Add ${missingLabels.slice(0, 2).join(' and ')} to improve your match rate with students.`;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target size={15} className="text-slate-900" />
          <span className="text-sm font-bold text-slate-800">Profile strength</span>
        </div>
        <span className="text-sm font-bold text-slate-900">{percent}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 mt-2.5 overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-slate-400 mt-2 leading-relaxed">{helperText}</p>
    </div>
  );
}
