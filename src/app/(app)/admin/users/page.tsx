import { getUsersWithClient } from '@/actions/adminUserAction';
import { getClients } from '@/actions/adminClientAction';
import ClientFilter from './_components/ClientFilter';

export default async function AdminUsersPage({
  searchParams,
}: {
  // searchParams 自体が Promise になっているため await が必要
  searchParams: Promise<{ clientId?: string }>;
}) {
  // searchParams を await で解決してから取得
  const params = await searchParams;
  const clientId = params.clientId;
  // 並行してデータを取得し、待ち時間を短縮
  const [users, clients] = await Promise.all([
    getUsersWithClient(clientId),
    getClients(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-slate-800">ユーザー管理</h1>
        {/* クライアント一覧をフィルターに渡す */}
        <ClientFilter clients={clients} />
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
            <tr>
              <th className="px-6 py-4">ID</th>
              <th className="px-6 py-4">名前</th>
              <th className="px-6 py-4">所属顧客</th>
              <th className="px-6 py-4">タイプ</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.user_id} className="border-t hover:bg-slate-50">
                <td className="px-6 py-4">{user.user_id}</td>
                <td className="px-6 py-4 font-medium">{user.user_name}</td>
                <td className="px-6 py-4">{user.com_m_client?.client_name || '-'}</td>
                <td className="px-6 py-4">{user.user_type}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  該当するユーザーが見つかりませんでした。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}