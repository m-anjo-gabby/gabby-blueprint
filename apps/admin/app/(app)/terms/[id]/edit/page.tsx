// apps/admin/app/(app)/terms/[id]/edit/page.tsx
import { getTranslations } from 'next-intl/server';
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
  const t = await getTranslations('terms.editPage');
  const tCommon = await getTranslations('terms.common');
  const { id } = await params;

  let term;
  let content;

  try {
    term = await getTermById(id);
    if (!term) {
      notFound(); // データが見つからない場合はNext.jsのnot-foundページを表示
    }
    content = await getTermContent(term.storage_path);
  } catch (error) {
    // データ取得中にエラーが発生した場合
    console.error("Failed to load term data:", error);
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] text-rose-600">
        <p>{t('loadFailedTitle')}</p>
        <p className="text-sm text-slate-500 mt-2">{t('loadFailedHint')}</p>
      </div>
    );
  }

  // データが正常に取得できた場合のみJSXをレンダリング
  return (
    <div className="flex flex-col h-[calc(100vh-120px)] space-y-4">
      <div className="flex flex-col">
        {/* 戻る導線 */}
        <Link
            href="/terms"
            className="flex items-center text-[13px] text-slate-500 hover:text-indigo-600 transition-colors mb-2 w-fit"
        >
            <ChevronLeft size={14} className="mr-1" />
            {t('backToList')}
        </Link>

        <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            {t('editTitle', { version: term.version_name })}
        </h1>
        <p className="text-[13px] text-slate-500 mt-1">
            {t('subtitle', { termType: term.term_type === "TERMS" ? tCommon('termTypeTerms') : tCommon('termTypePrivacy') })}
        </p>
      </div>

      <TermEditor 
        termId={term.term_id}
        termType={term.term_type}
        initialVersion={term.version_name}
        initialContent={content} 
        storagePath={term.storage_path} 
      />
    </div>
  );
}