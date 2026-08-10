'use client';

import { MessageSquare, Languages } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ChatPlayground from './ChatPlayground';
import TranslatePlayground from './TranslatePlayground';

export default function AIPlaygroundTabs() {
  return (
    <Tabs defaultValue="chat" className="w-full max-w-[1200px]">
      <TabsList>
        <TabsTrigger value="chat" className="gap-2">
          <MessageSquare size={14} /> AI Chat
        </TabsTrigger>
        <TabsTrigger value="translate" className="gap-2">
          <Languages size={14} /> 英文翻訳
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
