import { getTranslations } from 'next-intl/server';
import { getTags } from "@/actions/adminTagAction";
import { TagDataTable } from "./_components/TagDataTable";
import { TagFormDialog } from "./_components/TagFormDialog";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export default async function TagsPage() {
  const t = await getTranslations('contents.tags.page');
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
            <ChevronLeft size={14} /> {t('backToContents')}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-xs text-slate-500 mt-1">
            {t('description')}
          </p>
        </div>
        <TagFormDialog />
      </div>

      {/* 一覧テーブル */}
      <TagDataTable data={tags} />

    </div>
  );
}