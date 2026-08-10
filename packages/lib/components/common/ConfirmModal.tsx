// components/common/ConfirmModal.tsx
'use client';
import { motion } from 'framer-motion';
import { Trash2, AlertTriangle, Info } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
  isModal?: boolean;
}

export const ConfirmModal = ({ title, message, onConfirm, onCancel, variant = 'danger', isModal = true }: ConfirmModalProps) => {
  const themes = {
    danger: { bg: 'bg-rose-50', text: 'text-rose-500', btn: 'bg-rose-500 hover:bg-rose-600 shadow-rose-100', icon: Trash2 },
    warning: { bg: 'bg-amber-50', text: 'text-amber-500', btn: 'bg-amber-500 hover:bg-amber-600 shadow-amber-100', icon: AlertTriangle },
    info: { bg: 'bg-indigo-50', text: 'text-indigo-500', btn: 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-100', icon: Info },
  };

  const theme = themes[variant];
  const Icon = theme.icon;

  // オーバーレイクリック時のハンドラー
  const handleOverlayClick = () => {
    if (!isModal) onCancel();
  };

  return (
    <div
      data-confirm-modal=""
      className="fixed inset-0 z-9999 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm pointer-events-auto"
      onClick={handleOverlayClick}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-white rounded-[40px] p-8 w-full max-w-xs shadow-2xl space-y-6 text-center"
      >
        <div className={`w-16 h-16 ${theme.bg} ${theme.text} rounded-full flex items-center justify-center mx-auto shadow-inner`}>
          <Icon size={28} />
        </div>

        <div className="space-y-2">
          <p className="font-[1000] text-slate-800 text-lg tracking-tight">{title}</p>
          <p className="text-[11px] text-slate-400 font-bold leading-relaxed">{message}</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="flex-1 h-12 text-[11px] font-black text-slate-400 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-all">
            キャンセル
          </button>
          <button onClick={onConfirm} className={`flex-1 h-12 text-[11px] font-black text-white ${theme.btn} rounded-2xl shadow-lg transition-all active:scale-95`}>
            OK
          </button>
        </div>
      </motion.div>
    </div>
  );
};