'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, ArrowRight, Star } from 'lucide-react';

// Actions & Utils
import { getDashboardCorpusData } from '@/actions/dashboardAction';
import { getTrainingPath } from '@/utils/navigation';
import { CorpusRecord } from '@/types/corpus';

/**
 * 学習者用メインダッシュボード
 * 役割: 
 * 1. 進捗統計の表示
 * 2. おすすめ教材やお気に入り教材へのクイックアクセス
 * 3. ライブラリや詳細ページへのルーティング（Next.js Routerを使用）
 */
export default function StudentDashboard() {
  const router = useRouter();

  // --- States ---
  const [corpusList, setCorpusList] = useState<CorpusRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // おすすめとお気に入りのフィルタリング（メモ化せずにシンプルに定義）
  const recommendations = corpusList.filter(c => c.recommend > 0 && !c.is_favorite);

  // --- Data Fetching ---
    useEffect(() => {
      async function initDashboard() {
        try {
          // 複数のデータ取得処理を配列で定義
          const [corpusData] = await Promise.all([
            getDashboardCorpusData(),
            // getUserProgressData(), // ← こんな感じ
          ]);
          
          setCorpusList(corpusData);
        } catch (error) {
          console.error("Dashboard Load Error:", error);
        } finally {
          setLoading(false);
        }
      }
      initDashboard();
    }, []);

  // --- Render: Loading State ---
  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[60vh] space-y-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
        </div>
        <p className="text-slate-400 text-sm font-medium animate-pulse">Loading Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10 py-10 px-4 ease-out">
      
      {/* 1. Header Section */}
      <div className="flex flex-col items-center text-center py-6 sm:py-10">
        
        <div className="space-y-6">
          <div className="relative inline-block pb-2">
            {/* ブランドタイトル */}
            <h1 className="text-4xl sm:text-5xl font-[1000] tracking-tighter leading-[1.1] 
              bg-linear-to-br from-slate-900 via-indigo-950 to-indigo-600 
              bg-clip-text text-transparent py-1"> 
              Blueprint English
            </h1>
            
            {/* センターバー */}
            <div className="mt-2 h-1 w-32 bg-linear-to-r from-indigo-600 via-blue-500 to-cyan-400 rounded-full mx-auto shadow-[0_4px_12px_-2px_rgba(79,70,229,0.4)]" />
          </div>

          {/* キャッチコピー */}
          <p className="text-[10px] sm:text-xs font-black text-slate-400 uppercase 
                        tracking-[0.18em] sm:tracking-[0.4em] 
                        leading-none opacity-70 whitespace-nowrap">
            Tailor-made for <span className="text-indigo-600/50">Professional ROI</span>
          </p>
        </div>
        
      </div>

      {/* 2. Info Stats Bar */}
      <div className="flex flex-col sm:flex-row justify-center gap-4 px-2 max-w-3xl mx-auto">
        {/* 1. Library */}
        <button
          onClick={() => router.push('/student/library')}
          className="group relative flex-1 p-0.5 rounded-[28px] transition-all duration-500
             /* 静止時：ブランドカラーでクッキリとした細い枠線 */
             bg-indigo-300
             /* ホバー時：対称グラデーションへ滑らかに変化 */
             hover:bg-linear-to-br hover:from-blue-600 hover:via-slate-100 hover:via-50% hover:to-indigo-700
             shadow-[0_4px_15px_-3px_rgba(79,70,229,0.1)] hover:shadow-xl hover:shadow-indigo-200/50
             active:scale-[0.98]"
        >
          <div className="flex items-center gap-4 bg-white rounded-[27px] px-5 py-4 h-full transition-all duration-500 group-hover:bg-indigo-50/40">
            {/* アイコン：ホバーで背景が塗りつぶされる */}
            <div className="shrink-0 w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 transition-all duration-500 group-hover:bg-indigo-600 group-hover:text-white shadow-inner group-hover:shadow-none">
              <BookOpen size={20} strokeWidth={2.5} />
            </div>

            <div className="flex-1 text-left">
              <p className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-0.5 group-hover:text-indigo-700 transition-colors">Library</p>
              <p className="text-sm font-black text-slate-700 tracking-tight group-hover:text-slate-900">教材を選択する</p>
            </div>

            <div className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all duration-300">
              <ArrowRight size={18} strokeWidth={3} />
            </div>
          </div>
        </button>

        {/* 2. Favorites */}
        <button
          onClick={() => router.push('/student/favorites')}
          className="group relative flex-1 p-0.5 rounded-[28px] transition-all duration-500
                    /* 静止時：安定感のあるアンバー単色の2pxボーダー */
                    bg-amber-300
                    /* ホバー時：右上(orange)と左下(amber)のベストな対象グラデーションを上書き */
                    hover:bg-linear-to-br hover:from-amber-400 hover:via-slate-100 hover:via-50% hover:to-orange-500
                    /* 影の演出：アンバー系の光をわずかに纏わせる */
                    shadow-[0_4px_15px_-3px_rgba(245,158,11,0.1)] hover:shadow-xl hover:shadow-amber-200/50
                    active:scale-[0.98]"
        >
          {/* 内側：bg-white（不透明）で境界線のエッジを保護 */}
          <div className="flex items-center gap-4 bg-white rounded-[27px] px-5 py-4 h-full transition-all duration-500 group-hover:bg-amber-50/40">
            {/* アイコン：ホバーで背景がアンバーに塗りつぶされる */}
            <div className="shrink-0 w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 transition-all duration-500 group-hover:bg-amber-500 group-hover:text-white shadow-inner group-hover:shadow-none">
              <Star size={20} fill="currentColor" />
            </div>

            <div className="flex-1 text-left">
              <p className="text-[9px] font-black text-amber-600 uppercase tracking-[0.2em] mb-0.5 group-hover:text-amber-700 transition-colors">Favorites</p>
              <p className="text-sm font-black text-slate-700 tracking-tight group-hover:text-slate-900">お気に入りを復習する</p>
            </div>

            <div className="text-slate-300 group-hover:text-amber-600 group-hover:translate-x-1 transition-all duration-300">
              <ArrowRight size={18} strokeWidth={3} />
            </div>
          </div>
        </button>
      </div>

      {/* 3 Recommended Section: 整理されたおすすめカード */}
      <div className="space-y-6 px-2">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-xs font-black text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-2">
            <div className="w-1.5 h-4 bg-linear-to-b from-indigo-600 to-cyan-400 rounded-full" /> 
            Picked for You
          </h2>
          <button 
            onClick={() => router.push('/student/library')}
            className="text-[10px] font-black text-slate-400 hover:text-indigo-600 transition-colors uppercase tracking-widest border-b border-transparent hover:border-indigo-600 pb-0.5"
          >
            View Library
          </button>
        </div>

        <div className="grid gap-6">
          {recommendations.length > 0 ? (
            recommendations.map((corpus) => (
              <button
                key={corpus.corpus_id}
                onClick={() => router.push(getTrainingPath(corpus))}
                className="group relative w-full text-left p-0.5 rounded-4xl transition-all duration-500
                          /* 静止時：安定感のある2pxボーダー */
                          bg-slate-200 
                          /* ホバー時：右上と左下の対象グラデーションを上書き */
                          hover:bg-linear-to-br hover:from-indigo-600 hover:via-blue-400 hover:to-cyan-400
                          shadow-sm hover:shadow-2xl hover:shadow-indigo-100/50
                          active:scale-[0.99]"
              >
                {/* メインコンテンツ容器（bg-whiteで境界線をパキッとさせる） */}
                <div className="relative bg-white rounded-[31px] p-6 overflow-hidden h-full">
                  
                  {/* 背景の装飾光（ホバー時に少し強調） */}
                  <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-50/30 rounded-full -mr-24 -mt-24 blur-3xl transition-all duration-700 group-hover:bg-indigo-100/50" />
                  
                  <div className="relative space-y-5">
                    {/* 1. Header: ラベル・難易度・Matchスコアを1行に集約 */}
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[9px] font-black tracking-widest uppercase">
                          {corpus.corpus_label}
                        </span>
                        <span className="text-[10px] font-bold text-slate-300 tracking-wider">
                          Lv.{corpus.difficulty_level}
                        </span>
                      </div>

                      {/* おすすめ度（Match Score） */}
                      <div className="flex items-center gap-1.5 text-emerald-500 font-black text-[10px]">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                        <span className="tracking-tighter">{corpus.recommend}% Match</span>
                      </div>
                    </div>

                    {/* 2. Main Info: タイトルと説明文をノイズなく配置 */}
                    <div className="space-y-2">
                      <h3 className="text-[20px] font-black text-slate-800 tracking-tight leading-tight group-hover:text-indigo-600 transition-colors">
                        {corpus.corpus_name}
                      </h3>
                      <p className="text-[13px] text-slate-500 leading-relaxed font-medium line-clamp-2">
                        {corpus.description}
                      </p>
                    </div>

                    {/* 3. Tags: 下部にコンパクトに配置 */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {corpus.metadata.tags?.slice(0, 3).map(t => (
                        <span key={t.id} className="px-2 py-0.5 rounded-md border border-slate-100 bg-slate-50/50 text-slate-400 text-[8px] font-black uppercase tracking-wider">
                          #{t.label}
                        </span>
                      ))}
                    </div>

                    {/* 4. Action Button */}
                    <div className="pt-1">
                      <div className="w-full h-12 bg-slate-50 rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 group-hover:bg-indigo-600 group-hover:gap-5">
                        {/* テキスト */}
                        <span className="text-indigo-600 font-black text-[11px] tracking-[0.15em] uppercase group-hover:text-white transition-all">
                          Start Learning
                        </span>
                        
                        {/* 矢印アイコンを囲む円形 */}
                        <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-indigo-600 shadow-sm transition-all group-hover:bg-indigo-500 group-hover:text-white">
                          <ArrowRight size={12} strokeWidth={3} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            ))
          ) : (
            /* 空状態（Coming Soon） */
            <div className="text-center py-16 bg-slate-50/30 rounded-4xl border-2 border-dashed border-slate-100">
              <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center mx-auto mb-4 text-slate-200 shadow-sm">
                <BookOpen size={28} />
              </div>
              <p className="text-slate-400 text-sm font-bold tracking-tight">新しい教材を準備中です</p>
              <p className="text-slate-300 text-[10px] mt-1 uppercase tracking-[0.2em] font-black">Coming Soon</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}