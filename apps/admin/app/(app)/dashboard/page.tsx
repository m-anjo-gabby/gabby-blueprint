import { createServerClient } from "@gabby/lib/supabase/server";
import { canAccessPath } from "@/lib/navigation";
import { getDashboardSummary, type DashboardModuleKey } from "@/actions/adminDashboardAction";
import { DASHBOARD_MODULE_CONFIG, DASHBOARD_MODULE_ORDER } from "./_components/moduleConfig";
import DashboardHeader from "./_components/DashboardHeader";
import ModuleSummaryGrid from "./_components/ModuleSummaryGrid";

export default async function Page() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const roles = (user?.app_metadata?.roles as string[] | undefined) || [];

  // サイドバー（lib/navigation.ts）と同じ権限定義を使い、閲覧権限のあるモジュールのみ表示・取得する
  const visibleKeys: DashboardModuleKey[] = DASHBOARD_MODULE_ORDER.filter((key) =>
    canAccessPath(DASHBOARD_MODULE_CONFIG[key].href, roles)
  );

  const modules = await getDashboardSummary(visibleKeys);

  return (
    <div className="space-y-8">
      <DashboardHeader />
      <ModuleSummaryGrid modules={modules} />
    </div>
  );
}