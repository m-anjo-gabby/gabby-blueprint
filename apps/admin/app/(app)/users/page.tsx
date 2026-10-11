import { getTranslations } from 'next-intl/server';
import { getUsers } from '@/actions/adminUserAction';
import { getClientsFilter } from '@/actions/adminClientAction';
import { PageHeader } from '@/components/common/PageHeader';
import { parseListParams, toPageCount, type RawSearchParams } from '@/lib/list';
import { UserFormDialog } from './_components/UserFormDialog';
import { UserBulkImportDialog } from './_components/UserBulkImportDialog';
import { UserDataTable } from './_components/UserDataTable';
import { USER_LIST_FILTERS } from './_lib/list';

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [t, params] = await Promise.all([getTranslations('users.page'), searchParams]);
  const [{ rows, totalCount }, clients] = await Promise.all([
    getUsers(parseListParams(params, USER_LIST_FILTERS)),
    getClientsFilter(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <>
            <UserBulkImportDialog />
            <UserFormDialog mode="create" />
          </>
        }
      />
      <UserDataTable data={rows} totalCount={totalCount} pageCount={toPageCount(totalCount)} clients={clients} />
    </div>
  );
}
