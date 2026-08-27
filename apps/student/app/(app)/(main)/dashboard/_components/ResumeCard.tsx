'use client';

import { History, ArrowRight, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { getContentTypeConfig } from "@gabby/lib/content/ui";
import { cn } from "@/lib/utils";
import { ResumeContentResponse } from "@gabby/types/training";
import { useRouter } from "next/navigation";
import { getResumePath } from "@gabby/lib/navigation/student-path";
import { getCefrStyle } from "@gabby/lib/content/ui";

interface ResumeCardProps {
  data: ResumeContentResponse;
  onClear: () => void;
}

export const ResumeCard = ({ data, onClear }: ResumeCardProps) => {
  const router = useRouter();
  const content = data.com_m_contents;
  const { metadata } = data;

  // 参照先コンテンツがRLS等で不可視・削除済みの場合は描画しない
  // （サーバー側の取得処理で孤立ブックマークは自動クリーンアップされる想定）
  if (!content) {
    return null;
  }

  // コンテンツ種別に応じたアイコンや配色設定を取得
  const { icon: TypeIcon, label: typeLabel, theme } = getContentTypeConfig(content.content_type);

  // メタデータから表示情報を抽出
  const progress = metadata.display?.progress_percent ?? 0;
  const positionLabel = metadata.display?.position_text || `Item ${data.item_id ? 'Active' : 'N/A'}`;
  
  // 教材マスター側のmetadataからCEFR情報を取得
  const cefr = content.metadata?.cefr;

  return (
    <motion.div 
      layout 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }}
      role="button"
      tabIndex={0}
      onClick={() => router.push(getResumePath(data))}
      onKeyDown={(e) => e.key === 'Enter' && router.push(getResumePath(data))}
      className={cn(
        "group relative w-full p-0.5 rounded-[32px] bg-white border-2 transition-all cursor-pointer shadow-sm hover:shadow-md active:scale-[0.99]",
        theme.border
      )}
    >
      <div className="p-6">
        {/* Header: ステータス表示と削除ボタン */}
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-xl bg-slate-50", theme.text)}>
              <History size={18} strokeWidth={2.5} className="animate-pulse" />
            </div>
            <span className={cn("text-[10px] font-black uppercase tracking-[0.2em]", theme.text)}>
              Continue Learning
            </span>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="p-2 text-slate-300 hover:text-rose-500 transition-colors z-10"
            aria-label="Clear bookmark"
          >
            <Trash2 size={18} />
          </button>
        </div>

        {/* Body: 教材名と進捗バー */}
        <div className="space-y-5">
          <div className="space-y-2">
            {/* 種別ラベルとCEFRバッジを横並びに配置（共通カードと統一） */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 opacity-60">
                <TypeIcon size={12} className={theme.text} />
                <span className={cn("text-[9px] font-bold uppercase tracking-tighter", theme.text)}>
                  {typeLabel}
                </span>
              </div>
              
              {cefr && (
                <span className={cn(
                  // inline-flex に変更し、中央揃えを徹底
                  "inline-flex items-center justify-center",
                  // 左右のパディングを少し広げ、高さを明示的に微調整（必要に応じて）
                  "px-2 py-0.5 min-w-[28px]", 
                  // rounded-full で完全なカプセル型を強制
                  "rounded-full text-[8px] font-black tracking-tighter uppercase leading-none",
                  getCefrStyle(cefr.id)
                )}>
                  {cefr.label}
                </span>
              )}
            </div>

            <h3 className="text-xl font-[1000] text-slate-800 leading-tight tracking-tight line-clamp-2">
              {content.content_name}
            </h3>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-end px-0.5">
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                {positionLabel}
              </span>
              <span className="text-xs font-black text-slate-700">{progress}%</span>
            </div>
            {/* 進捗バー本体 */}
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className={cn("h-full transition-all rounded-full", theme.button)}
              />
            </div>
          </div>
        </div>

        {/* Footer: アクションボタン */}
        <div className={cn(
          "mt-6 w-full rounded-2xl flex items-center justify-center gap-2 h-12 font-black text-[11px] tracking-[0.2em] uppercase transition-all shadow-lg group-hover:scale-[1.02]",
          theme.button, "text-white"
        )}>
          Resume Now
          <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </motion.div>
  );
};