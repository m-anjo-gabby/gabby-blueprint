'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
// 💡 アイコンを BarChart3 に変更し、ArrowRight を追加
import { BookOpen, CheckCircle2, BarChart3, ArrowRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

// Stores & Utils
import { useContentStore } from '@/stores/useContentStore';
import { useResumeStore } from '@/stores/useResumeStore';
import { toggleContentFavorite } from '@/actions/contentAction';
import { getTrainingPath } from '@gabby/lib/navigation/student-path';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';

// Components
import { ContentCard } from '@/components/common/ContentCard';
import { DashboardHero } from './_components/DashboardHero';
import { NavigationGrid } from './_components/NavigationGrid';
import { ResumeCard } from './_components/ResumeCard';
import { DashboardEmptyState } from './_components/DashboardEmptyState';
import { Skeleton } from '@/components/ui/skeleton';

// 未確定機能の表示フラグ（採用時に true に変更）
const SHOW_EXPERIMENTAL_FEATURES = false;

export default function StudentDashboard() {
  const router = useRouter();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  // Stores
  const { allContents, isLoading, fetchAllContents, updateFavoriteStatus } = useContentStore();
  const { resumeData, isResumeLoading, fetchResume, clearResume } = useResumeStore();

  // 1. 初期データの取得
  useEffect(() => {
    Promise.all([fetchAllContents(), fetchResume()]);
  }, [fetchAllContents, fetchResume]);

  // 2. おすすめ教材の算出
  const recommendations = useMemo(() => {
    if (!allContents) return [];
    return allContents
      .filter(c => c.recommend > 0 && !c.is_favorite)
      .sort((a, b) => b.recommend - a.recommend)
      .slice(0, 3);
  }, [allContents]);

  // 3. お気に入り切り替えハンドラー
  const handleToggleFavorite = async (contentId: string, currentState: boolean) => {
    const nextState = !currentState;
    updateFavoriteStatus(contentId, nextState);
    try {
      await toggleContentFavorite(contentId, nextState);
      showToast(nextState ? "お気に入りに追加しました" : "解除しました", "success");
    } catch (error) {
      updateFavoriteStatus(contentId, currentState);
      showToast("更新に失敗しました", "error");
      console.error(error);
    }
  };

  /**
   * 栞（再開情報）の削除ハンドラー
   */
  const handleClearResume = async () => {
    const ok = await showConfirm(
      "ブックマークを削除？",
      "この教材のブックマークを削除します。よろしいですか？",
      { variant: 'danger' }
    );

    if (ok) {
      try {
        await clearResume();
        showToast("再開情報を削除しました", "success");
      } catch (error) {
        showToast("削除に失敗しました", "error");
        console.error(error);
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-10 py-10 px-4 mb-20">
      {/* ヒーローセクション（挨拶など） */}
      <DashboardHero />

      {/* クイックナビゲーション */}
      <NavigationGrid />

      {SHOW_EXPERIMENTAL_FEATURES && (
        /* 📊 改善版: 白ベースで他カードと調和させた学習ログ導線 */
        <section className="px-2">
          <button 
            onClick={() => router.push('/training/sprint/history')}
            className="w-full p-4 bg-white border border-slate-100 rounded-[28px] shadow-sm flex items-center justify-between hover:bg-slate-50/80 hover:border-slate-200 transition-all group active:scale-[0.99] cursor-pointer"
          >
            <div className="flex items-center gap-3 text-left">
              {/* アイコン背景をインディゴのグラデーションにしてアクセントに */}
              <div className="w-10 h-10 bg-linear-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs">
                <BarChart3 size={18} />
              </div>
              <div>
                <p className="text-[9px] font-black tracking-wider text-indigo-600 uppercase">Learning Logs</p>
                <p className="text-xs font-black text-slate-700 mt-0.5">これまでの学習履歴と統計を確認</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ArrowRight size={14} className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
            </div>
          </button>
        </section>
      )}

      {/* 再開セクション：学習リズムを維持するための重要エリア */}
      <section className="space-y-6 px-2">
        <h2 className="text-xs font-black text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-2 px-2">
          <div className="w-1.5 h-4 bg-linear-to-b from-indigo-600 to-cyan-400 rounded-full" /> 
          Continue Learning
        </h2>
        
        <AnimatePresence mode="wait">
          {isResumeLoading ? (
            <Skeleton key="skeleton" className="h-40 w-full rounded-[32px] opacity-50" />
          ) : resumeData ? (
            <ResumeCard key="card" data={resumeData} onClear={handleClearResume} />
          ) : (
            <DashboardEmptyState 
              key="empty"
              icon={BookOpen}
              title="ブックマークした教材がありません"
              description="教材を選択して学習を開始しましょう"
            />
          )}
        </AnimatePresence>
      </section>

      {SHOW_EXPERIMENTAL_FEATURES && (
        /* おすすめセクション */
        <section className="space-y-6 px-2">
          <h2 className="text-xs font-black text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-2 px-2">
            <div className="w-1.5 h-4 bg-linear-to-b from-indigo-600 to-cyan-400 rounded-full" /> 
            Picked for You
          </h2>
          
          <div className="space-y-5">
            <AnimatePresence mode="popLayout">
              {isLoading ? (
                [...Array(2)].map((_, i) => (
                  <Skeleton key={`rec-skeleton-${i}`} className="h-48 w-full rounded-[32px] opacity-50" />
                ))
              ) : recommendations.length > 0 ? (
                recommendations.map((content) => (
                  <ContentCard 
                    key={content.content_id}
                    content={content}
                    onToggleFavorite={handleToggleFavorite}
                    onStart={(c) => router.push(getTrainingPath(c))}
                    actionMode="dashboard"
                  />
                ))
              ) : (
                <DashboardEmptyState 
                  key="empty-rec"
                  icon={CheckCircle2}
                  title="すべてチェック済みです！"
                  description="新しい教材の追加をお楽しみに"
                />
              )}
            </AnimatePresence>
          </div>
        </section>
      )}
    </div>
  );
}