import { Bot } from 'lucide-react';
import AIPlaygroundTabs from './_components/AIPlaygroundTabs';

/**
 * AI Playground メインページ
 * packages/lib/ai の検証用UI（Gemini Chat / 英文翻訳）
 */
export default function AIPlaygroundPage() {
  return (
    <div className="space-y-10 pb-16">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-600/20 text-white">
            <Bot size={28} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">
              AI Playground
            </h1>
            <p className="text-sm font-medium text-slate-500">
              Gemini APIを利用したAI機能（チャット・翻訳）の検証ツールです。
            </p>
          </div>
        </div>
      </header>

      <AIPlaygroundTabs />
    </div>
  );
}
