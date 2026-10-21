// apps/admin/app/(app)/terms/[id]/edit/page.tsx
import { getTranslations } from 'next-intl/server';
import { notFound, unstable_rethrow } from 'next/navigation';
import { createLogger } from '@gabby/lib/logger';
import type { TermDetail } from '@gabby/types/term';
import { getTermDetail } from '@/actions/adminTermAction';
import { PageHeader } from '@/components/common/PageHeader';
import { TermEditor } from './_components/TermEditor';

const logger = createLogger('admin');

export default async function TermEditPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('terms.editPage');
  const tCommon = await getTranslations('terms.common');
  const { id } = await params;

  let term: TermDetail | null;

  try {
    term = await getTermDetail(id);
  } catch (error) {
    unstable_rethrow(error);
    // データ取得中にエラーが発生した場合
    logger.error('term:get_term_detail_failed', 'Failed to load term data', { err: error });
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] text-rose-600">
        <p>{t('loadFailedTitle')}</p>
        <p className="text-sm text-slate-500 mt-2">{t('loadFailedHint')}</p>
      </div>
    );
  }

  if (!term) {
    notFound(); // データが見つからない場合はNext.jsのnot-foundページを表示
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] space-y-4">
      <PageHeader
        back={{ href: '/terms', label: t('backToList') }}
        title={t('editTitle', { version: term.version_name })}
        description={t('subtitle', {
          termType: term.term_type === 'TERMS' ? tCommon('termTypeTerms') : tCommon('termTypePrivacy'),
        })}
      />

      {/* 保存後はリビジョン履歴が更新されるため、最新リビジョンIDをkeyにして編集状態を初期化する */}
      <TermEditor key={term.revisions[0]?.revision_id ?? 'empty'} term={term} />
    </div>
  );
}
