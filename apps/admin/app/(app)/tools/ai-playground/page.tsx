import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/common/PageHeader';
import { AiPlaygroundTabs } from './_components/AiPlaygroundTabs';

/**
 * AI Playground メインページ
 * packages/lib/ai の検証用UI（Gemini Chat / 英文翻訳）
 */
export default async function AiPlaygroundPage() {
  const t = await getTranslations('tools.aiPlayground.page');
  return (
    <div className="space-y-6 pb-16">
      <PageHeader title="AI Playground" description={t('subtitle')} />

      <AiPlaygroundTabs />
    </div>
  );
}
