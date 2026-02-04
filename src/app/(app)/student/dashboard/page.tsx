import LogoutButton from "@/components/common/LogoutButton";

export default function StudentDashboard() {
  return (
    <div className="p-8">
      <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl">
        <h1 className="text-2xl font-bold text-emerald-900">生徒ダッシュボード</h1>
        <p className="text-emerald-600 mt-2">本日の学習フレーズを確認しましょう。</p>

        <LogoutButton />
      </div>
    </div>
  );
}