'use client';

import { useState } from 'react';
import { Eye } from 'lucide-react';
import { CoachProfileCard } from '@gabby/lib/components/common/CoachProfileCard';
import { CoachProfileDialog } from '@gabby/lib/components/common/CoachProfileDialog';
import { CoachProfileCardData, CoachProfileDialogLabels } from '@gabby/types/coachProfile';
import { ProfileCompletionMeter } from './ProfileCompletionMeter';

interface LivePreviewPanelProps {
  data: CoachProfileCardData;
  labels: CoachProfileDialogLabels;
  completionPercent: number;
  missingLabels: string[];
}

/**
 * Public Coach Profileの入力内容を、生徒に見えるカードとしてその場で表示するサイドパネル。
 * 「全画面プレビュー」はCoachProfileDialog（生徒側と共通のコンポーネント）をそのまま再利用する。
 */
export function LivePreviewPanel({ data, labels, completionPercent, missingLabels }: LivePreviewPanelProps) {
  const [showFullPreview, setShowFullPreview] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <ProfileCompletionMeter percent={completionPercent} missingLabels={missingLabels} />

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <Eye size={13} />
            Live Preview
          </div>
          <button
            type="button"
            onClick={() => setShowFullPreview(true)}
            className="text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            Open full preview
          </button>
        </div>
        <CoachProfileCard data={data} labels={labels} className="p-5 space-y-5" />
      </div>

      {showFullPreview && <CoachProfileDialog data={data} labels={labels} onClose={() => setShowFullPreview(false)} />}
    </div>
  );
}
