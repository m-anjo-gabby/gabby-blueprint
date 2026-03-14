import { getContents } from '@/actions/adminContentAction';
import { ContentDataTable } from './_components/ContentDataTable';
import { ContentFormDialog } from './_components/ContentFormDialog';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Tag } from 'lucide-react';

export default async function AdminContentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  // 1. Next.js 15 の仕様に基づき searchParams を await する
  const params = await searchParams;
  const currentPage = Number(params.page) || 1;
  const searchQuery = params.q || "";
  const pageSize = 10;

  // 2. サーバーアクションから「教材データ」と「総件数」を取得
  // getContents は種別順(content_type)・表示順(seq_no)でソート済み
  const { contents, totalCount } = await getContents(currentPage, pageSize, searchQuery);

  // 3. 全ページ数を計算
  const pageCount = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">教材管理</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            教材の基本情報と、公開範囲および表示順を管理します。
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* タグ管理への導線 */}
          <Button variant="outline" asChild>
            <Link href="/admin/contents/tags">
              <Tag className="mr-2 h-4 w-4" />
              タグ管理
            </Link>
          </Button>
          {/* 教材マスタそのものを新規作成するダイアログ */}
          <ContentFormDialog mode="create" />
        </div>
      </div>

      {/* 4. ContentDataTable は内部で columns を定義しているため、data, pageCount, totalCount を渡す */}
      <ContentDataTable 
        data={contents || []} 
        pageCount={pageCount}
        totalCount={totalCount}
      />
    </div>
  );
}