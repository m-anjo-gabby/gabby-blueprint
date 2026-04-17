export default function AdminDashboard() {
  // Vercel環境変数の取得
  const env = process.env.NEXT_PUBLIC_VERCEL_ENV || "development";
  const commitSha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || "local";
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "not set";

  return (
    <div className="p-8 space-y-6">
      <div className="bg-indigo-50 border border-indigo-100 p-8 rounded-2xl shadow-sm">
        <h1 className="text-2xl font-bold text-indigo-900">管理者ダッシュボード</h1>
        <p className="text-indigo-600 mt-2">管理者としてログインしています。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border rounded-xl bg-white shadow-sm">
          <p className="text-sm text-gray-500 font-medium">Environment</p>
          <p className="text-lg font-bold capitalize text-gray-800">{env}</p>
        </div>
        <div className="p-4 border rounded-xl bg-white shadow-sm">
          <p className="text-sm text-gray-500 font-medium">Commit SHA</p>
          <p className="text-lg font-mono font-bold text-gray-800">{commitSha}</p>
        </div>
        <div className="p-4 border rounded-xl bg-white shadow-sm">
          <p className="text-sm text-gray-500 font-medium">API Endpoint</p>
          <p className="text-sm font-mono font-bold text-indigo-700 truncate" title={apiUrl}>
            {apiUrl}
          </p>
        </div>
      </div>
    </div>
  );
}