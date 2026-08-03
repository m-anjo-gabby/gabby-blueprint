import { Library } from 'lucide-react';
import { getKnowledgeEntries } from '@/actions/aiKnowledgeBaseAction';
import { KnowledgeEntryList } from './_components/KnowledgeEntryList';

export const metadata = {
  title: 'AI Knowledge Base | Gabby Blueprint Admin',
  description: 'ヘルプ記事・AIコーチ知識・ロールプレイシナリオ等、RAG検索対象のナレッジを管理します。',
};

export const revalidate = 0;

/**
 * AI Knowledge Base 管理ページ
 * ヘルプ記事等を登録すると、AIチャットのRAG検索対象になる（packages/lib/ai/retrieval）
 */
export default async function AIKnowledgeBasePage() {
  const entries = await getKnowledgeEntries();

  return (
    <div className="space-y-8 pb-16">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-600/20 text-white">
            <Library size={28} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">
              AI Knowledge Base
            </h1>
            <p className="text-sm font-medium text-slate-500">
              ヘルプ記事等を登録すると、AI Chatの回答がこのナレッジを参照するようになります（RAG）。
            </p>
          </div>
        </div>
      </header>

      <KnowledgeEntryList entries={entries} />
    </div>
  );
}
