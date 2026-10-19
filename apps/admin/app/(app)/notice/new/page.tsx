// apps/admin/app/(app)/notice/new/page.tsx
import { getClientsFilter } from '@/actions/adminClientAction';
import { NoticeEditor } from '../_components/NoticeEditor';
import { getDefaultNoticePublishedDate } from '../_lib/dates';

export default async function NoticeCreatePage() {
  const clientOptions = await getClientsFilter();
  return (
    <NoticeEditor mode="create" clientOptions={clientOptions} defaultPublishedDate={getDefaultNoticePublishedDate()} />
  );
}
