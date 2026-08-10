// components/common/CoachProfileDialog.tsx
'use client';

import { motion } from 'framer-motion';
import { X, GraduationCap, Award, Clock, Briefcase, MessageSquare } from 'lucide-react';
import { CoachProfileDialogData, CoachProfileDialogLabels } from '@gabby/types/coachProfile';

export interface CoachProfileDialogProps {
  data: CoachProfileDialogData;
  labels: CoachProfileDialogLabels;
  onClose: () => void;
}

interface ProfileSection {
  icon: typeof GraduationCap;
  label: string;
  value: string | null;
}

/**
 * コーチ公開プロフィールのプレビュー表示用ダイアログ（ポータル共通）
 * 生徒がコーチ選択時に参照する画面、およびコーチ自身のプレビュー確認の両方から利用する。
 * 静的文言・整形済みの表示値は呼び出し側（各ポータル）からpropsで注入し、
 * 本コンポーネント自体は言語・DBの詳細を一切知らない。
 */
export function CoachProfileDialog({ data, labels, onClose }: CoachProfileDialogProps) {
  const sections: ProfileSection[] = [
    { icon: Clock, label: labels.coachSince, value: data.coachSinceLabel },
    { icon: GraduationCap, label: labels.education, value: data.education },
    { icon: Award, label: labels.qualifications, value: data.qualifications },
    { icon: Clock, label: labels.englishTeaching, value: data.teachingYearsLabel },
    { icon: Briefcase, label: labels.jobExperience, value: data.jobExperience },
    { icon: MessageSquare, label: labels.personalIntroduction, value: data.introduction },
  ].filter((section) => !!section.value);

  return (
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm pointer-events-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-[32px] w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
      >
        <button
          onClick={onClose}
          aria-label={labels.closeLabel}
          className="absolute right-5 top-5 w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors"
        >
          <X size={16} />
        </button>

        <div className="p-8 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center text-slate-400 text-xl font-bold">
              {data.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.iconUrl} alt={data.userName} className="w-full h-full object-cover" />
              ) : (
                data.userName.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-slate-800 truncate">{data.userName}</p>
              {data.countryName && (
                <div className="flex items-center gap-1.5 mt-1">
                  {data.countryFlagUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={data.countryFlagUrl} alt={data.countryName} className="w-4 h-4 rounded-full object-cover" />
                  )}
                  <span className="text-xs text-slate-500">{data.countryName}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-5">
            {sections.map(({ icon: Icon, label, value }, index) => (
              <div key={index} className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <Icon size={13} />
                  {label}
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
