import AdminDashboardClient from "./_components/AdminDashboardClient";

// コンポーネント側で定義した型と合わせるための定義
type StatColor = "blue" | "emerald" | "orange" | "purple";

interface StatItem {
  title: string;
  count: string;
  desc: string;
  color: StatColor;
}

export default function Page() {
  // サーバーサイドで環境変数を取得
  const env = process.env.NEXT_PUBLIC_VERCEL_ENV || "development";
  const commitSha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || "local";
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "not set";

  // colorに 'as const' をつけるか、型を明示することでエラーを解消します
  const statsData: StatItem[] = [
    { title: "顧客管理", count: "16", desc: "法人・団体アカウントの管理", color: "blue" },
    { title: "契約管理", count: "52", desc: "ライセンス発行・有効期限確認", color: "emerald" },
    { title: "ユーザ管理", count: "1,204", desc: "受講生・講師の権限管理", color: "orange" },
    { title: "教材管理", count: "92", desc: "カリキュラム・コンテンツ更新", color: "purple" },
  ];

  return (
    <AdminDashboardClient 
      env={env}
      commitSha={commitSha}
      apiUrl={apiUrl}
      statsData={statsData}
    />
  );
}