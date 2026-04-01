'use client';

import Link from 'next/link';
import { ChevronLeft, BookOpen, Layers, CheckCircle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ContentRecord, CONTENT_TYPES } from '@/types/content';
import { WordBulkImportDialog } from './editors/WordEditor/WordBulkImportDialog';
import { TTSBulkDialog } from './editors/WordEditor/TTSBulkDialog';

interface ContentHeaderProps {
  content: ContentRecord;
}

export function EditorHeader({ content }: ContentHeaderProps) {
  const typeLabel = CONTENT_TYPES[content.content_type]?.label || 'Unknown';

  return (
    <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
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
            <h1 className="text-sm font-black text-slate-900 truncate max-w-75">
              {content.content_name}
            </h1>
            <Badge variant="secondary" className="bg-slate-100 text-[10px] font-bold py-0 h-5 text-slate-500">
              ID: {content.content_id.slice(0, 8)}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
            <span className="flex items-center gap-1">
              <Layers size={10} /> {typeLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* 単語・フレーズタイプの場合のみ表示 */}
        {content.content_type === 0 && (
          <>
            {/* 一括登録ボタン */}
            <WordBulkImportDialog contentId={content.content_id} />

            {/* 一括音声生成ボタン
                phrases は渡さず、Dialog内部で自律的に取得するように変更
            */}
            <TTSBulkDialog 
              contentId={content.content_id} 
            >
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 px-4 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 font-bold gap-2 transition-all shadow-sm"
              >
                <Zap size={14} fill="currentColor" />
                一括音声生成
              </Button>
            </TTSBulkDialog>
          </>
        )}

        <div className="w-px h-6 bg-slate-200 mx-1" />

        <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
          <CheckCircle size={14} />
          <span className="text-[11px] font-black uppercase tracking-wider">Live Sync</span>
        </div>
      </div>
    </header>
  );
}