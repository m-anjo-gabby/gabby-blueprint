'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { BookOpen, ArrowRight, Star } from 'lucide-react';

// Actions & Utils
import { ClientInfo, getDashboardCorpusData, getMyClientInfo } from '@/actions/dashboardAction';
import { getTrainingPath } from '@/utils/navigation';
import { CorpusRecord } from '@/types/corpus';

/**
 * 学習者用メインダッシュボード
 * 役割: 
 * 1. 顧客ロゴや進捗統計の表示
 * 2. おすすめ教材やお気に入り教材へのクイックアクセス
 * 3. ライブラリや詳細ページへのルーティング（Next.js Routerを使用）
 */
export default function StudentDashboard() {
  const router = useRouter();

  // --- States ---
  const [corpusList, setCorpusList] = useState<CorpusRecord[]>([]);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // おすすめとお気に入りのフィルタリング（メモ化せずにシンプルに定義）
  const favorites = corpusList.filter(c => c.is_favorite);
  const recommendations = corpusList.filter(c => c.recommend > 0 && !c.is_favorite);

  // --- Data Fetching ---
  useEffect(() => {
    async function initDashboard() {
      try {
        // 全データを並列で取得して初期化
        const [corpusData, clientData] = await Promise.all([
          getDashboardCorpusData(),
          getMyClientInfo(),
        ]);
        setCorpusList(corpusData);
        setClientInfo(clientData);
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
        <p className="text-slate-400 text-sm font-medium animate-pulse">Loading Curriculums...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10 py-10 px-4 animate-in fade-in slide-in-from-bottom-6 duration-700 ease-out">
      
      {/* 1. Header Section: ロゴとパーソナライズされた挨拶 */}
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="relative w-full max-w-60 h-20">
          {clientInfo?.logo_url ? (
            <Image 
              src={clientInfo.logo_url} 
              alt={clientInfo.client_name || "Client Logo"}
              fill
              sizes="240px"
              className="object-contain"
              priority
            />
          ) : (
            <div className="text-4xl font-black text-indigo-600 tracking-tighter">BLUEPRINT</div>
          )}
        </div>
        
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">
            Blueprint English
            <span className="text-indigo-600 block text-lg mt-2 font-bold">
              for {clientInfo?.dashboard_title || 'Personal'}
            </span>
          </h1>
          <p className="text-slate-500 font-medium tracking-wide text-sm">学習する教材を選択してください</p>
        </div>
      </div>

      {/* 2. Info Stats Bar: 主要機能へのナビゲーション導線 */}
<div className="flex flex-col sm:flex-row justify-center gap-4 px-4 max-w-3xl mx-auto">
  {/* 1. Library: 教材を探す */}
  <button 
    onClick={() => router.push('/student/library')} 
    className="group flex items-center gap-4 bg-white px-6 py-5 rounded-[28px] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-indigo-100/40 hover:-translate-y-0.5 transition-all w-full sm:flex-1 min-w-[240px]"
  >
    <div className="shrink-0 w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
      <BookOpen size={22} />
    </div>
    <div className="flex-1 text-left min-w-0">
      <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.15em] mb-0.5">Library</p>
      <p className="text-[13px] font-black text-slate-800 leading-tight">ライブラリから選ぶ</p>
    </div>
    <ArrowRight size={16} className="text-slate-200 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
  </button>

  {/* 2. Favorites: 復習する */}
  <button 
    onClick={() => router.push('/student/favorites')} 
    className="group flex items-center gap-4 bg-white px-6 py-5 rounded-[28px] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-amber-100/40 hover:-translate-y-0.5 transition-all w-full sm:flex-1 min-w-[240px]"
  >
    <div className="shrink-0 w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-all duration-300">
      <Star size={22} fill="currentColor" />
    </div>
    <div className="flex-1 text-left min-w-0">
      <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.15em] mb-0.5">Favorites</p>
      <p className="text-[13px] font-black text-slate-800 leading-tight">お気に入りを復習する</p>
    </div>
    <ArrowRight size={16} className="text-slate-200 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
  </button>
</div>

      {/* 3. My Favorites Section: 最近のお気に入りへのショートカット */}
      {favorites.length > 0 && (
        <div className="space-y-4 px-2">
          <h2 className="text-xs font-black text-amber-500 uppercase tracking-[0.2em] flex items-center gap-2">
            <Star size={14} fill="currentColor" /> My Favorites
          </h2>
          <div className="grid gap-3">
            {favorites.map((corpus) => (
              <button
                key={corpus.corpus_id}
                onClick={() => router.push(getTrainingPath(corpus))}
                className="group bg-white/60 backdrop-blur-sm p-4 rounded-[28px] border border-slate-100 shadow-sm hover:shadow-md hover:border-amber-100 transition-all flex items-center gap-4 text-left active:scale-[0.98]"
              >
                <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-400 group-hover:bg-amber-400 group-hover:text-white transition-all duration-300">
                  <Star size={20} fill="currentColor" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">
                    {corpus.corpus_label} • Lv.{corpus.difficulty_level}
                  </p>
                  <h3 className="font-bold text-slate-800 truncate group-hover:text-amber-600 transition-colors">
                    {corpus.corpus_name}
                  </h3>
                </div>
                <ArrowRight size={16} className="text-slate-200 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. Recommended Section: おすすめ教材の強調表示 */}
      <div className="space-y-6 px-2">
        <h2 className="text-xs font-black text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-2">
          <BookOpen size={14} /> Picked for You
        </h2>
        <div className="grid gap-6">
          {recommendations.length > 0 ? (
            recommendations.map((corpus) => (
              <button
                key={corpus.corpus_id}
                onClick={() => router.push(getTrainingPath(corpus))}
                className="group relative w-full text-left p-8 bg-white rounded-[40px] border border-slate-200/60 shadow-sm hover:shadow-2xl hover:shadow-indigo-100/50 hover:-translate-y-1.5 transition-all duration-500 isolate overflow-hidden"
              >
                {/* 装飾背景 */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-50/40 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-indigo-100/60 transition-colors duration-700" />
                
                <div className="relative space-y-6">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold tracking-wider uppercase">
                        {corpus.corpus_label}
                      </div>
                      <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-tight group-hover:text-indigo-600 transition-colors">
                        {corpus.corpus_name}
                      </h2>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-2xl text-slate-300 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-inner">
                      <ArrowRight size={20} />
                    </div>
                  </div>

                  <p className="text-sm text-slate-500 leading-relaxed font-medium line-clamp-2">
                    {corpus.description}
                  </p>

                  {/* Level & Action Footer */}
                  <div className="pt-6 flex items-center justify-between border-t border-slate-50">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Level {corpus.difficulty_level}</span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((step) => (
                          <div key={step} className={`w-1.5 h-1.5 rounded-full ${step <= corpus.difficulty_level ? 'bg-indigo-500' : 'bg-slate-100'}`} />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-indigo-600 font-black text-[11px] tracking-tighter">
                      START LEARNING
                      <div className="w-5 h-5 rounded-full bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <ArrowRight size={10} />
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="text-center py-12 bg-slate-50/50 rounded-[40px] border border-dashed border-slate-200">
              <p className="text-slate-400 text-sm font-medium">Explore more in Course Library</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}