import { getTags } from "@/actions/adminTagAction";
import { TagDataTable } from "./_components/TagDataTable";
import { TagFormDialog } from "./_components/TagFormDialog";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export default async function TagsPage() {
  const tags = await getTags();

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <Link 
            href="/contents" 
            className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <ChevronLeft size={14} /> 教材管理に戻る
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">タグ管理</h1>
          <p className="text-xs text-slate-500 mt-1">
            教材に設定するタグを管理します
          </p>
        </div>
        <TagFormDialog />
      </div>

      {/* 一覧テーブル */}
      <TagDataTable data={tags} />

    </div>
  );
}