// apps/admin/app/(app)/terms/[id]/edit/page.tsx
import { getTermById, getTermContent } from "@/actions/adminTermAction";
import { TermEditor } from "./_components/TermEditor";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export default async function TermEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  try {
    const term = await getTermById(id);
    if (!term) return notFound();

    const content = await getTermContent(term.storage_path);

    return (
      <div className="flex flex-col h-[calc(100vh-120px)] space-y-4">
        <div className="flex flex-col">
          {/* 戻る導線 */}
          <Link 
              href="/terms" 
              className="flex items-center text-[13px] text-slate-500 hover:text-indigo-600 transition-colors mb-2 w-fit"
          >
              <ChevronLeft size={14} className="mr-1" />
              規約管理一覧に戻る
          </Link>

          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
              規約編集: {term.version_name}
          </h1>
          <p className="text-[13px] text-slate-500 mt-1">
              {term.term_type === "TERMS" ? "利用規約" : "プライバシーポリシー"} の文言を直接修正します。
          </p>
        </div>

        <TermEditor 
          initialContent={content} 
          storagePath={term.storage_path} 
        />
      </div>
    );
  } catch (error) {
    return <div>データの読み込みに失敗しました。</div>;
  }
}