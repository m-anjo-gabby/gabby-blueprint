import { getTranslations } from 'next-intl/server';
import { getKnowledgeEntries } from '@/actions/aiKnowledgeBaseAction';
import { PageHeader } from '@/components/common/PageHeader';
import { parseListParams, toPageCount, type RawSearchParams } from '@/lib/list';
import { KnowledgeEntryDataTable } from './_components/KnowledgeEntryDataTable';
import { KnowledgeEntryFormDialog } from './_components/KnowledgeEntryFormDialog';
import { KNOWLEDGE_LIST_FILTERS } from './_lib/list';

export const metadata = {
  title: 'AI Knowledge Base | Gabby Blueprint Admin',
  description: 'ヘルプ記事・AIコーチ知識・ロールプレイシナリオ等、RAG検索対象のナレッジを管理します。',
};

/**
 * AI Knowledge Base 管理ページ
 * ヘルプ記事等を登録すると、AIチャットのRAG検索対象になる（packages/lib/ai/retrieval）
 */
export default async function AIKnowledgeBasePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [t, params] = await Promise.all([getTranslations('tools.aiKnowledgeBase.page'), searchParams]);
  const { rows, totalCount } = await getKnowledgeEntries(parseListParams(params, KNOWLEDGE_LIST_FILTERS));

  return (
    <div className="space-y-6">
      <PageHeader title="AI Knowledge Base" description={t('subtitle')} actions={<KnowledgeEntryFormDialog mode="create" />} />
      <KnowledgeEntryDataTable data={rows} totalCount={totalCount} pageCount={toPageCount(totalCount)} />
    </div>
  );
}
