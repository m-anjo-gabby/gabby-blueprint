// src\app\(app)\admin\contents\[id]\_components\editors\WordEditor\index.tsx
'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { type PhraseRecord, type WordRecord } from '@gabby/types/word';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { WordList } from './WordList';
import { PhraseList } from './PhraseList';
import { Search } from 'lucide-react';

interface WordEditorProps {
  contentId: string;
  /** ページでサーバー取得した単語の一覧（null は取得の失敗） */
  initialWords: WordRecord[] | null;
  /** 開いた時に選ばれていた単語と、そのフレーズの一覧（ページでサーバー取得する） */
  initialPhrases: { wordId: string; phrases: PhraseRecord[] | null } | null;
}

export function WordEditor({ contentId, initialWords, initialPhrases }: WordEditorProps) {
  const t = useTranslations('contents.editor.word.index');
  // 単語の選び直しは履歴だけを変える（WordList）ため、選択中の単語は URL から読む
  const selectedWordId = useSearchParams().get('wordId');

  return (
    <div className="flex-1 min-h-0 min-w-0 w-full border-t border-slate-200 bg-white flex overflow-hidden">
      <ResizablePanelGroup orientation="horizontal" className="flex-1 w-full min-w-0">
        {/* 左ペイン：単語リスト */}
        <ResizablePanel
          id="panel-word-list"
          defaultSize={30}
          minSize={20}
          className="flex flex-col min-w-0 overflow-hidden"
        >
          <WordList contentId={contentId} initialWords={initialWords} />
        </ResizablePanel>

        {/* 境界線 */}
        <ResizableHandle withHandle className="w-1.5 bg-slate-200 hover:bg-brand-300 transition-colors" />

        {/* 右ペイン：フレーズ詳細 */}
        <ResizablePanel
          id="panel-phrase-detail"
          defaultSize={70}
          className="flex flex-col min-w-0 overflow-hidden bg-slate-50"
        >
          {selectedWordId ? (
            <PhraseList
              key={selectedWordId}
              wordId={selectedWordId}
              initialPhrases={initialPhrases?.wordId === selectedWordId ? initialPhrases.phrases : undefined}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
              <div className="p-6 bg-white rounded-full shadow-sm">
                <Search size={32} className="text-slate-200" />
              </div>
              <p className="text-sm font-medium italic">{t('emptyState')}</p>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
