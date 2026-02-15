'use client';

import { useState, useEffect } from 'react';
import CorpusCard from '@/components/student/CorpusCard';
import { ClientInfo, getDashboardCorpusData, getMyClientInfo } from '@/actions/dashboardAction';
import { BookOpen, ArrowRight, Star } from 'lucide-react';
import Image from 'next/image';
import { getFavoriteCount } from '@/actions/corpusAction';
import FavoriteList from '@/components/student/FavoriteList';
import CorpusLibrary from '@/components/student/CorpusLibrary';
import { CorpusRecord } from '@/types/corpus';

type ViewMode = 'dashboard' | 'training' | 'favorites' | 'library';

/**
 * 学習者用メインダッシュボード
 * 顧客に紐付いたコーパス（学習教材）を一覧表示し、学習セクションへの入り口を提供します。
 */
export default function StudentDashboard() {
  // --- State ---
  const [selectedCorpusId, setSelectedCorpusId] = useState<string | null>(null);
  const [corpusList, setCorpusList] = useState<CorpusRecord[]>([]);
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('dashboard');

  const favorites = corpusList.filter(c => c.is_favorite);
  const recommendations = corpusList.filter(c => c.recommend > 0 && !c.is_favorite);

  // --- スクロールリセット ---
  useEffect(() => {
    // ページマウント時、またはコーパス選択解除（selectedCorpusIdがnullに戻った時）に実行
    if (!selectedCorpusId) {
      setTimeout(() => {
        const main = document.querySelector('main');
        main?.scrollTo(0, 0);
      }, 50);
    }
  }, [selectedCorpusId]);

  // --- Data Fetching ---
  useEffect(() => {
    async function initDashboard() {
      try {
        // 並列で取得
        const [corpusData, clientData, favCount] = await Promise.all([
          getDashboardCorpusData(),
          getMyClientInfo(),
          getFavoriteCount()
        ]);
        setCorpusList(corpusData);
        setClientInfo(clientData);
        setFavoriteCount(favCount);
      } catch (error) {
        console.error("Dashboard Load Error:", error);
      } finally {
        setLoading(false);
      }
    }
    initDashboard();
  }, []);

  // 共通の戻る処理 + カウント更新
  const handleBackAndRefresh = async () => {
    setView('dashboard'); // 画面を戻す
    
    try {
      // 最新の件数を取得して反映
      const favCount = await getFavoriteCount();
      setFavoriteCount(favCount);
    } catch (error) {
      console.error("Failed to refresh favorite count:", error);
    }
  };

  // --- View: Mode ---
  // コーパス選択時は学習カード画面（子コンポーネント）へ切り替え
  if (view === 'training' && selectedCorpusId) {
    return <CorpusCard sectionId={selectedCorpusId} onBack={handleBackAndRefresh} />;
  }

  // コース選択時はコース一覧（子コンポーネント）へ切り替え
  if (view === 'library') {
    return (
      <CorpusLibrary 
        onSelect={(id) => {
          setSelectedCorpusId(id);
          setView('training');
        }}
        onBack={() => setView('dashboard')} 
      />
    );
  }

  // お気に入り選択時はフレーズ一覧（子コンポーネント）へ切り替え
  if (view === 'favorites') {
    return <FavoriteList onBack={handleBackAndRefresh} />;
  }
  // --- View: Loading State ---
  // 読み込み中
  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-100 space-y-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
        </div>
        <p className="text-slate-400 text-sm font-medium animate-pulse">Loading Curriculums...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700 ease-out">
      
      {/* Header Section: サービスロゴとガイドメッセージ */}
      <div className="flex flex-col items-center text-center space-y-4">
        {/* ロゴ外側のコンテナ：サイズを固定し、はみ出しを防ぐ */}
        <div className="relative w-full max-w-60 h-20">
          {clientInfo?.logo_url ? (
            <Image 
              src={clientInfo.logo_url} 
              alt={clientInfo.client_name || "Client Logo"}
              fill
              sizes="240px"
              /* object-contain で比率を維持しつつ、最大サイズまで広げる */
              className="object-contain"
              priority
            />
          ) : (
            /* ロゴがない場合のフォールバック（テキストのみでシンプルに） */
            <div className="text-4xl font-black text-indigo-600 tracking-tighter">
              BLUEPRINT
            </div>
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

      {/* Info Stats Bar: 学習状況とアクション導線 */}
      <div className="grid grid-cols-2 gap-4 px-2">
        
        {/* 左側：Courses (教材一覧ライブラリへのボタン) */}
        <button 
          onClick={() => setView('library')}
          className="group bg-white p-4 rounded-3xl border border-indigo-100 shadow-sm hover:shadow-lg hover:shadow-indigo-100 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
              <BookOpen size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-indigo-600/60 uppercase leading-none mb-1 tracking-wider">Courses</p>
              <p className="text-sm font-black text-slate-800 leading-none">
                {corpusList.length} <span className="text-[11px] font-medium text-slate-500">Books</span>
              </p>
            </div>
          </div>
          <ArrowRight size={14} className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
        </button>

        {/* 右側：Favorites (お気に入り一覧ライブラリへのボタン)  */}
        <button 
          onClick={() => setView('favorites')}
          className="group bg-white p-4 rounded-3xl border border-amber-200 shadow-sm hover:shadow-lg hover:shadow-amber-100 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-colors duration-300">
              <Star size={20} fill="currentColor" className={favoriteCount > 0 ? "animate-pulse" : ""} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-amber-600/60 uppercase leading-none mb-1 tracking-wider">Favorites</p>
              <p className="text-sm font-black text-slate-800 leading-none">
                {favoriteCount} <span className="text-[11px] font-medium text-slate-500">Items</span>
              </p>
            </div>
          </div>
          <ArrowRight size={14} className="text-slate-300 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" />
        </button>
      </div>

      {/* Section 1: My Favorites (お気に入り) */}
      {favorites.length > 0 && (
        <div className="space-y-4 px-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black text-amber-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <Star size={14} fill="currentColor" /> My Favorites
            </h2>
          </div>
          <div className="grid gap-3">
            {favorites.map((corpus) => (
              <button
                key={corpus.corpus_id}
                onClick={() => { setSelectedCorpusId(corpus.corpus_id); setView('training'); }}
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

      {/* Section 2: Recommended (おすすめ) */}
      <div className="space-y-6 px-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black text-indigo-500 uppercase tracking-[0.2em] flex items-center gap-2">
            <BookOpen size={14} /> Picked for You
          </h2>
        </div>
        <div className="grid gap-6">
          {recommendations.length > 0 ? (
            recommendations.map((corpus) => (
              <button
                key={corpus.corpus_id}
                onClick={() => { setSelectedCorpusId(corpus.corpus_id); setView('training'); }}
                className="group relative w-full text-left p-8 bg-white rounded-[40px] border border-slate-200/60 shadow-sm hover:shadow-2xl hover:shadow-indigo-100/50 hover:-translate-y-1.5 transition-all duration-500 isolate overflow-hidden"
              >
                {/* 装飾的な背景グラデーション */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-50/40 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-indigo-100/60 transition-colors duration-700"></div>
                
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