'use client';

import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { CoachProfileDialogData, CoachProfileDialogLabels } from '@gabby/types/coachProfile';
import { CoachProfileCardHeader, CoachProfileCardBody } from './CoachProfileCard';

export interface CoachProfileDialogProps {
  data: CoachProfileDialogData;
  labels: CoachProfileDialogLabels;
  onClose: () => void;
}

/**
 * コーチ公開プロフィールのプレビュー表示用ダイアログ（ポータル共通）
 * 生徒がコーチ選択時に参照する画面、およびコーチ自身のプレビュー確認の両方から利用する。
 * 表示内容そのものはCoachProfileCardHeader/CoachProfileCardBodyに集約し、本コンポーネントはモーダルの外枠
 * （背景・閉じるボタン・アニメーション）と、ヘッダーを固定したまま本文だけをスクロールさせるレイアウトを担う。
 */
export function CoachProfileDialog({ data, labels, onClose }: CoachProfileDialogProps) {
  return (
    <div
      className="fixed inset-0 z-9999 flex items-start justify-center overflow-y-auto p-6 pt-20 bg-slate-900/40 backdrop-blur-sm pointer-events-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-[32px] w-full max-w-[33rem] max-h-[calc(100vh-6.5rem)] shadow-2xl flex flex-col overflow-hidden"
      >
        <button
          onClick={onClose}
          aria-label={labels.closeLabel}
          className="absolute right-5 top-5 w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors"
        >
          <X size={16} />
        </button>

        <CoachProfileCardHeader data={data} className="flex items-center gap-4 px-8 pt-8 pb-6 border-b border-slate-100" />

        {/* 角丸コーナーとスクロールバーが重ならないよう、スクロール領域は外枠の右端から少し内側(mr-4)に余白を取る */}
        <div className="flex-1 min-h-0 overflow-y-auto mr-4">
          <CoachProfileCardBody data={data} labels={labels} className="px-8 pt-6 pb-8 space-y-6" />
        </div>
      </motion.div>
    </div>
  );
}
