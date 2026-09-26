import { Bot } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import AIPlaygroundTabs from './_components/AIPlaygroundTabs';

/**
 * AI Playground メインページ
 * packages/lib/ai の検証用UI（Gemini Chat / 英文翻訳）
 */
export default async function AIPlaygroundPage() {
  const t = await getTranslations('tools.aiPlayground.page');
  return (
    <div className="space-y-10 pb-16">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand rounded-xl shadow-lg shadow-brand/20 text-white">
            <Bot size={28} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">
              AI Playground
            </h1>
            <p className="text-sm font-medium text-slate-500">
              {t('subtitle')}
            </p>
          </div>
        </div>
      </header>

      <AIPlaygroundTabs />
    </div>
  );
}
