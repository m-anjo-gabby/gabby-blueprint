import { BookOpenText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { getCVDictionaryByWord, getCVDictionaryWords } from '@/actions/adminCVDictionaryAction';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { CVEntryPane } from './_components/CVEntryPane';
import { CVWordList } from './_components/CVWordList';

// メタデータ

export const metadata = {
  title: 'CV Dictionary | Gabby Blueprint Admin',
  description: 'ColorVowel辞書の管理画面。単語・品詞別エントリの登録・編集・音声作成を行います。',
};

// Props

interface CVDictionaryPageProps {
  searchParams: Promise<{ word?: string }>;
}

// Page

export default async function CVDictionaryPage({ searchParams }: CVDictionaryPageProps) {
  const t = await getTranslations('tools.cvDictionary.page');
  const { word } = await searchParams;
  const wordEn = word ? decodeURIComponent(word) : null;
  // 一覧はサーバーで取得し、各ペインは編集・選び直しの後だけブラウザから取り直す
  const [words, entries] = await Promise.all([getCVDictionaryWords(), wordEn ? getCVDictionaryByWord(wordEn) : null]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* ページヘッダー */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
        <div className="p-2 bg-brand-50 rounded-xl">
          <BookOpenText size={20} className="text-brand" />
        </div>
        <div>
          <h1 className="text-base font-black text-slate-800 tracking-tight">ColorVowel Dictionary</h1>
          <p className="text-[11px] text-slate-400 font-medium">{t('subtitle')}</p>
        </div>
      </div>

      {/* 2ペインエディタ */}
      <div className="flex-1 min-h-0 min-w-0 w-full bg-white flex overflow-hidden">
        <ResizablePanelGroup orientation="horizontal" className="flex-1 w-full min-w-0">
          {/* 左ペイン：単語一覧 */}
          <ResizablePanel
            id="panel-cv-word-list"
            defaultSize={28}
            minSize={20}
            className="flex flex-col min-w-0 overflow-hidden"
          >
            <Suspense>
              <CVWordList initialWords={words.success ? words.data : null} />
            </Suspense>
          </ResizablePanel>

          {/* 境界線 */}
          <ResizableHandle withHandle className="w-1.5 bg-slate-200 hover:bg-brand-300 transition-colors" />

          {/* 右ペイン：品詞別エントリ一覧 */}
          <ResizablePanel
            id="panel-cv-entry-detail"
            defaultSize={72}
            className="flex flex-col min-w-0 overflow-hidden bg-slate-50"
          >
            <Suspense>
              <CVEntryPane
                initial={wordEn && entries ? { wordEn, entries: entries.success ? entries.data : null } : null}
              />
            </Suspense>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
