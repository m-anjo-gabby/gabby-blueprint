'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star, ArrowRight, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FavoriteContentRecord } from '@/types/content';
import { toggleContentFavorite } from '@/actions/contentAction';
import { useToast } from '@/hooks/useToast';
import { getTrainingPath } from '@/utils/navigation';
import { FavoritePageState } from '../page';

interface ContentFavoritesProps {
  contentes: FavoriteContentRecord[];
  setContentes: React.Dispatch<React.SetStateAction<FavoritePageState>>;
}

export default function ContentFavorites({ contentes, setContentes }: ContentFavoritesProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleConfirmRemove = async () => {
    if (!deletingId) return;
    const contentId = deletingId;
    
    try {
      await toggleContentFavorite(contentId, false);
      setContentes(prev => ({
        ...prev,
        contentes: prev.contentes ? prev.contentes.filter(c => c.content_id !== contentId) : null
      }));
      showToast('お気に入りから削除しました', 'success');
    } catch (error) {
      console.error("Failed to remove favorite:", error);
      showToast('削除に失敗しました', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  if (contentes.length === 0) {
    return (
      <div className="py-20 text-center space-y-4">
        <Star className="text-slate-200 mx-auto" size={48} />
        <p className="text-slate-400 text-sm font-bold tracking-wide">No favorite contentes</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <AnimatePresence mode="popLayout">
        {contentes.map((content) => (
          <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            key={content.content_id}
            className="bg-white border border-slate-100 rounded-4xl p-6 shadow-sm group relative overflow-hidden"
          >
            {/* 解除確認オーバーレイ（フレーズと同様のUI体験） */}
            <AnimatePresence>
              {deletingId && (
                <div className="fixed inset-0 z-100 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white rounded-[40px] p-8 w-full max-w-xs shadow-2xl space-y-6 text-center">
                    <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto shadow-inner"><Trash2 size={28} /></div>
                    <div className="space-y-2">
                      <p className="font-black text-slate-800 text-lg tracking-tight">Remove course?</p>
                      <p className="text-[11px] text-slate-400 font-medium leading-relaxed">この教材をお気に入りから削除しますか？</p>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setDeletingId(null)} className="flex-1 h-12 text-[11px] font-black text-slate-400 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-all">CANCEL</button>
                      <button onClick={handleConfirmRemove} className="flex-1 h-12 text-[11px] font-black text-white bg-rose-500 rounded-2xl hover:bg-rose-600 shadow-lg shadow-rose-100 transition-all active:scale-95">REMOVE</button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* ヘッダー: ラベルと削除ボタン */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-indigo-600 uppercase bg-indigo-50 px-2.5 py-1 rounded-lg">
                  {content.content_label}
                </span>
                <span className="text-[10px] font-bold text-slate-300">Lv.{content.difficulty_level}</span>
              </div>
              <button
                onClick={() => setDeletingId(content.content_id)}
                className="p-2 -mr-2 text-slate-200 hover:text-rose-400 transition-colors"
              >
                <Trash2 size={20} strokeWidth={2.5} />
              </button>
            </div>

            {/* コンテンツ */}
            <div className="mb-4">
              <h3 
                onClick={() => router.push(getTrainingPath(content))}
                className="font-black text-slate-800 text-[19px] leading-tight group-hover:text-indigo-600 transition-colors mb-2 cursor-pointer"
              >
                {content.content_name}
              </h3>
              <p className="text-[14px] text-slate-500 font-medium leading-relaxed line-clamp-2">
                {content.description}
              </p>
            </div>

            {/* タグ表示 */}
            <div className="flex flex-wrap gap-1.5 mb-6">
              {content.metadata.tags?.map(t => (
                <span key={t.id} className="px-2.5 py-1 rounded-full border border-slate-100 bg-slate-50/50 text-slate-400 text-[9px] font-extrabold uppercase">
                  {t.label}
                </span>
              ))}
            </div>

            {/* アクションボタン */}
            <button 
              onClick={() => router.push(getTrainingPath(content))}
              className="w-full h-14 bg-indigo-50 rounded-2xl flex items-center justify-center gap-3 hover:bg-indigo-600 transition-all active:scale-[0.98] group/btn"
            >
              <span className="text-indigo-600 font-black text-[12px] tracking-widest group-hover/btn:text-white transition-colors uppercase">
                Resume Learning
              </span>
              <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-indigo-600 group-hover/btn:bg-indigo-500 group-hover/btn:text-white transition-all shadow-sm">
                <ArrowRight size={12} strokeWidth={3} />
              </div>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}