// apps/admin/app/(app)/terms/page.tsx
import { getTerms } from "@/actions/adminTermAction";
import { TermDataTable } from "./_components/TermDataTable";
import { TermFormDialog } from "./_components/TermFormDialog";

export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const currentPage = Number(params.page) || 1;
  const searchQuery = params.q || "";
  const pageSize = 10;

  const { terms, totalCount } = await getTerms(currentPage, pageSize, searchQuery);
  const pageCount = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">規約管理</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            利用規約とプライバシーポリシーのバージョンを管理します。
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <TermFormDialog />
        </div>
      </div>

      <TermDataTable 
        data={terms || []} 
        pageCount={pageCount}
        totalCount={totalCount}
      />
    </div>
  );
}