// apps/student/app/(app)/(shell)/favorites/page.tsx
'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PhraseFavorites from './_components/PhraseFavorites';
import ContentFavorites from './_components/ContentFavorites';
import { ShellPanel, ShellPanelHeader } from '@/components/shell/ShellPanel';
import { SEGMENTED_TABS_LIST_CLASS, SEGMENTED_TABS_TRIGGER_CLASS } from '@/components/shell/segmentedTabs';

const FAVORITE_TABS = [
  { id: 'contents', label: '教材' },
  { id: 'phrases', label: 'フレーズ' },
] as const;

type TabId = typeof FAVORITE_TABS[number]['id'];

export default function FavoritePage() {
  const [activeTab, setActiveTab] = useState<TabId>('contents');

  return (
    <ShellPanel>
      <ShellPanelHeader title="お気に入り" back={{ history: '/dashboard' }}>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
          <TabsList className={SEGMENTED_TABS_LIST_CLASS}>
            {FAVORITE_TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className={SEGMENTED_TABS_TRIGGER_CLASS}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </ShellPanelHeader>

      <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth bg-canvas/60">
        <div className="px-5 sm:px-8 pt-6 pb-24">
          {/* 子コンポーネントが自分でデータを取ってくる */}
          {activeTab === 'contents' ? <ContentFavorites /> : <PhraseFavorites />}
        </div>
      </div>
    </ShellPanel>
  );
}