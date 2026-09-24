'use client';

import { MessageSquare, Languages } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ChatPlayground from './ChatPlayground';
import TranslatePlayground from './TranslatePlayground';

export default function AIPlaygroundTabs() {
  const t = useTranslations('tools.aiPlayground.tabs');
  return (
    <Tabs defaultValue="chat" className="w-full max-w-[1200px]">
      <TabsList>
        <TabsTrigger value="chat" className="gap-2">
          <MessageSquare size={14} /> {t('chatTab')}
        </TabsTrigger>
        <TabsTrigger value="translate" className="gap-2">
          <Languages size={14} /> {t('translateTab')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="chat" className="mt-6">
        <ChatPlayground />
      </TabsContent>

      <TabsContent value="translate" className="mt-6">
        <TranslatePlayground />
      </TabsContent>
    </Tabs>
  );
}
