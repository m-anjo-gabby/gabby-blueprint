import { getTranslations } from 'next-intl/server';
import { getTags } from '@/actions/adminTagAction';
import { PageHeader } from '@/components/common/PageHeader';
import { TagDataTable } from './_components/TagDataTable';
import { TagFormDialog } from './_components/TagFormDialog';

export default async function TagsPage() {
  const [t, tags] = await Promise.all([getTranslations('contents.tags.page'), getTags()]);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: '/contents', label: t('backToContents') }}
        title={t('title')}
        description={t('description')}
        actions={<TagFormDialog />}
      />
      <TagDataTable data={tags} />
    </div>
  );
}
