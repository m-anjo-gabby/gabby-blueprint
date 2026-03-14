import { Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function ContentsPage() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">教材管理</h1>
        <div className="flex gap-2">
          {/* タグ管理への導線 */}
          <Button variant="outline" asChild>
            <Link href="/admin/contents/tags">
              <Tag className="mr-2 h-4 w-4" />
              タグ管理
            </Link>
          </Button>
          {/* 新規登録モーダルを開くボタン */}
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            新規教材作成
          </Button>
        </div>
      </div>

      {/* 検索・フィルタ・テーブルコンポーネントを配置 */}
      <div className="bg-white rounded-md border shadow-sm">
         {/* <ContentsTable /> */}
      </div>
    </div>
  );
}