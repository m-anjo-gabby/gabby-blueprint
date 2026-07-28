import { Suspense } from 'react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { CVWordList } from './_components/CVWordList';
import { CVEntryList } from './_components/CVEntryList';
import { BookOpenText } from 'lucide-react';

// ============================================================
// メタデータ
// ============================================================

export const metadata = {
  title: 'CV Dictionary | Gabby Blueprint Admin',
  description: 'ColorVowel辞書の管理画面。単語・品詞別エントリの登録・編集・音声作成を行います。',
};

// ============================================================
// Props
// ============================================================

interface CVDictionaryPageProps {
  searchParams: Promise<{ word?: string }>;
}

// ============================================================
// Page
// ============================================================

export default async function CVDictionaryPage({ searchParams }: CVDictionaryPageProps) {
  const { word } = await searchParams;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* ページヘッダー */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
        <div className="p-2 bg-indigo-50 rounded-xl">
          <BookOpenText size={20} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-base font-black text-slate-800 tracking-tight">ColorVowel Dictionary</h1>
          <p className="text-[11px] text-slate-400 font-medium">CV辞書の単語・品詞別エントリ管理</p>
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
              <CVWordList />
            </Suspense>
          </ResizablePanel>

          {/* 境界線 */}
          <ResizableHandle withHandle className="w-1.5 bg-slate-200 hover:bg-indigo-300 transition-colors" />

          {/* 右ペイン：品詞別エントリ一覧 */}
          <ResizablePanel
            id="panel-cv-entry-detail"
            defaultSize={72}
            className="flex flex-col min-w-0 overflow-hidden bg-slate-50"
          >
            {word ? (
              <Suspense>
                <CVEntryList wordEn={decodeURIComponent(word)} />
              </Suspense>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
                <div className="p-6 bg-white rounded-full shadow-sm">
                  <BookOpenText size={32} className="text-slate-200" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-bold">単語を選択してください</p>
                  <p className="text-xs text-slate-300">左ペインから単語を選ぶと品詞別エントリが表示されます</p>
                </div>
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
