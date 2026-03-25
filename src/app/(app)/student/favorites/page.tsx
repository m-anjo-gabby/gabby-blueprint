// src/app/(app)/student/favorites/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PhraseFavorites from './_components/PhraseFavorites';
import ContentFavorites from './_components/ContentFavorites';
import { cn } from '@/lib/utils';

const FAVORITE_TABS = [
  { id: 'contents', label: '教材' },
  { id: 'phrases', label: 'フレーズ' },
] as const;

type TabId = typeof FAVORITE_TABS[number]['id'];

export default function FavoritePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('contents');

  return (
    <div className="w-full max-w-2xl h-full flex flex-col bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden font-sans">
      <div className="shrink-0 bg-white border-b border-slate-50 px-5 sm:px-8 pt-6 sm:pt-8 pb-6 space-y-6">
        <div className="flex items-center gap-1">
          <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-slate-100 rounded-2xl transition-all active:scale-90 text-slate-400">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Favorites</h1>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
          <TabsList className="w-full p-1 bg-slate-100 rounded-[20px] h-12">
            {FAVORITE_TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  "flex-1 rounded-[16px] text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all",
                  "data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm"
                )}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth bg-slate-50/30">
        <div className="px-5 sm:px-8 pt-6 pb-24">
          {/* 子コンポーネントが自分でデータを取ってくる */}
          {activeTab === 'contents' ? <ContentFavorites /> : <PhraseFavorites />}
        </div>
      </div>
    </div>
  );
}