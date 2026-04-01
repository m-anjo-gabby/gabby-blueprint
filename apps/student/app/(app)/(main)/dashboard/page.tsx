'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, CheckCircle2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

// Stores & Utils
import { useContentStore } from '@/stores/useContentStore';
import { useResumeStore } from '@/stores/useResumeStore';
import { toggleContentFavorite } from '@/actions/contentAction';
import { getTrainingPath } from '@/utils/navigation';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';

// Components
import { ContentCard } from '@/components/student/ContentCard';
import { DashboardHero } from './_components/DashboardHero';
import { NavigationGrid } from './_components/NavigationGrid';
import { ResumeCard } from './_components/ResumeCard';
import { DashboardEmptyState } from './_components/DashboardEmptyState';
import { Skeleton } from '@/components/ui/skeleton';

export default function StudentDashboard() {
  const router = useRouter();
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();

  // Stores
  const { allContents, isLoading, fetchAllContents, updateFavoriteStatus } = useContentStore();
  const { resumeData, isResumeLoading, fetchResume, clearResume } = useResumeStore();

  // 1. 初期データの取得
  useEffect(() => {
    // 依存配列に fetchAllContents, fetchResume を含めることで最新の状態を維持
    // 各Store側でキャッシュ（lastFetched）を制御しているため過剰なリクエストは防げます
    Promise.all([fetchAllContents(), fetchResume()]);
  }, [fetchAllContents, fetchResume]);

  // 2. おすすめ教材の算出（お気に入りを除外した上位3件）
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
    // 楽観的UI更新
    updateFavoriteStatus(contentId, nextState);
    try {
      await toggleContentFavorite(contentId, nextState);
      showToast(nextState ? "お気に入りに追加しました" : "解除しました", "success");
    } catch (error) {
      // 失敗時はロールバック
      updateFavoriteStatus(contentId, currentState);
      showToast("更新に失敗しました", "error");
      console.error(error);
    }
  };

  /**
   * 栞（再開情報）の削除ハンドラー
   * ResumeCardのゴミ箱アイコンがクリックされた時に実行される
   */
  const handleClearResume = async () => {
    // 1. ダイアログを表示してユーザーの意思を確認
    const ok = await showConfirm(
      "ブックマークを削除？",
      "この教材のブックマークを削除します。よろしいですか？",
      { variant: 'danger' }
    );

    // 2. OKが押された場合のみ削除を実行
    if (ok) {
      try {
        await clearResume(); // ストアのアクション（DB削除＋キャッシュクリア）
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

      {/* おすすめセクション */}
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
              /* おすすめがない場合（全て完了、もしくはお気に入り済み） */
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
    </div>
  );
}