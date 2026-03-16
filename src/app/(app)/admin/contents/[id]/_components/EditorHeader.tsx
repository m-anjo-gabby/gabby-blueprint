'use client';

import Link from 'next/link';
import { ChevronLeft, BookOpen, Layers, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ContentRecord, CONTENT_TYPES } from '@/types/content'; // 型をインポート

interface ContentHeaderProps {
  content: ContentRecord;
}

export function EditorHeader({ content }: ContentHeaderProps) {
  // content_type のラベルを取得 (0: 単語・フレーズ 等)
  const typeLabel = CONTENT_TYPES[content.content_type]?.label || 'Unknown';

  return (
    <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0 z-10">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild className="text-slate-500 hover:text-slate-900 -ml-2">
          <Link href="/admin/contents">
            <ChevronLeft size={20} className="mr-1" />
            一覧へ戻る
          </Link>
        </Button>

        <div className="w-px h-6 bg-slate-200 mx-2" />

        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-indigo-500" />
            <h1 className="text-sm font-black text-slate-900 truncate max-w-[300px]">
              {content.content_name} {/* title から content_name に変更 */}
            </h1>
            <Badge variant="secondary" className="bg-slate-100 text-[10px] font-bold py-0 h-5">
              ID: {content.content_id.slice(0, 8)}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
            <span className="flex items-center gap-1">
              <Layers size={10} /> {typeLabel} {/* 動的にラベルを表示 */}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
          <CheckCircle size={14} />
          <span className="text-[11px] font-black uppercase">Live Sync</span>
        </div>
      </div>
    </header>
  );
}