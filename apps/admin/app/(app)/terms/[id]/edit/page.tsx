// apps/admin/app/(app)/terms/[id]/edit/page.tsx
import { getTranslations } from 'next-intl/server';
import { getTermDetail } from "@/actions/adminTermAction";
import { TermEditor } from "./_components/TermEditor";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { TermDetail } from '@gabby/types/term';

export default async function TermEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations('terms.editPage');
  const tCommon = await getTranslations('terms.common');
  const { id } = await params;

  let term: TermDetail | null;

  try {
    term = await getTermDetail(id);
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

  if (!term) {
    notFound(); // データが見つからない場合はNext.jsのnot-foundページを表示
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] space-y-4">
      <div className="flex flex-col">
        {/* 戻る導線 */}
        <Link
            href="/terms"
            className="flex items-center text-[13px] text-slate-500 hover:text-brand transition-colors mb-2 w-fit"
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

      {/* 保存後はリビジョン履歴が更新されるため、最新リビジョンIDをkeyにして編集状態を初期化する */}
      <TermEditor key={term.revisions[0]?.revision_id ?? 'empty'} term={term} />
    </div>
  );
}
