'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search, Trash2, AlertCircle, Volume2 } from 'lucide-react';
import { getCVDictionaryWords, CVWordSummary } from '@/actions/adminCVDictionaryAction';
import { cn } from '@/lib/utils';
import { useToast } from '@gabby/lib/hooks/useToast';
import { CVWordFormDialog } from './CVWordFormDialog';
import { CVWordBulkImportDialog } from './CVWordBulkImportDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useCVDictionaryStore } from '@/stores/useCVDictionaryStore';
import { deleteCVDictionaryEntry } from '@/actions/adminCVDictionaryAction';

// ============================================================
// Component
// ============================================================

export function CVWordList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedWord = searchParams.get('word');
  const { showToast } = useToast();

  const [words, setWords] = useState<CVWordSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const lastUpdated = useCVDictionaryStore((s) => s.lastUpdated);
  const setSelectedWordStore = useCVDictionaryStore((s) => s.setSelectedWord);

  // ----------------------------------------------------------
  // データ取得
  // ----------------------------------------------------------

  const fetchWords = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getCVDictionaryWords();
      setWords(data);
    } catch {
      showToast('単語一覧の取得に失敗しました', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchWords();
  }, [fetchWords, lastUpdated]);

  // URLのwordが変わったらstoreを同期
  useEffect(() => {
    if (selectedWord) {
      const current = words.find((w) => w.word_en === selectedWord);
      if (current) setSelectedWordStore(current);
    } else {
      setSelectedWordStore(null);
    }
  }, [selectedWord, words, setSelectedWordStore]);

  // ----------------------------------------------------------
  // 選択
  // ----------------------------------------------------------

  const handleSelect = (word: CVWordSummary) => {
    router.push(`${pathname}?word=${encodeURIComponent(word.word_en)}`);
    setSelectedWordStore(word);
  };

  // ----------------------------------------------------------
  // 単語ごと削除（その単語の全品詞エントリを一括削除）
  // ----------------------------------------------------------

  const handleDeleteWord = async (wordEn: string) => {
    // その単語の全エントリを取得して順次削除
    try {
      const { getCVDictionaryByWord } = await import('@/actions/adminCVDictionaryAction');
      const entries = await getCVDictionaryByWord(wordEn);

      for (const entry of entries) {
        await deleteCVDictionaryEntry(entry.word_en, entry.part_of_speech);
      }

      showToast(`「${wordEn}」の全エントリを削除しました`, 'success');
      await fetchWords();

      if (selectedWord === wordEn) {
        router.push(pathname);
      }
    } catch {
      showToast('削除中にエラーが発生しました', 'error');
    }
  };

  // ----------------------------------------------------------
  // フィルター
  // ----------------------------------------------------------

  const filteredWords = words.filter((w) =>
    w.word_en.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="flex flex-col h-full bg-white min-w-0 overflow-hidden border-r border-slate-200">
      {/* ツールバー */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">CV Dictionary</h2>
          <div className="flex items-center gap-1.5">
            <CVWordBulkImportDialog onSuccess={fetchWords} />
            <CVWordFormDialog onSuccess={fetchWords} />
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
          <Input
            placeholder="Search words..."
            className="pl-9 h-9 bg-white border-slate-200 text-sm rounded-xl focus-visible:ring-indigo-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* リスト */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="animate-spin text-slate-200" />
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filteredWords.map((word) => {
              const isSelected = selectedWord === word.word_en;
              const audioRatio = word.entry_count > 0 ? word.has_audio_count / word.entry_count : 0;

              return (
                <div
                  key={word.word_en}
                  onClick={() => handleSelect(word)}
                  className={cn(
                    'group relative flex flex-col p-3 px-4 cursor-pointer transition-all hover:bg-slate-50 border-l-4',
                    isSelected ? 'bg-indigo-50/50 border-indigo-500' : 'border-transparent'
                  )}
                >
                  {/* 英単語 */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="text-sm font-black text-slate-800 truncate flex-1">{word.word_en}</div>
                  </div>

                  {/* 品詞数・音声バッジ */}
                  <div className="mt-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 font-bold border-none bg-slate-100 text-slate-400"
                      >
                        {word.entry_count} POS
                      </Badge>
                      {word.has_audio_count > 0 && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-1.5 py-0 font-bold border-none gap-0.5',
                            audioRatio === 1
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-amber-50 text-amber-600'
                          )}
                        >
                          <Volume2 size={9} className="inline mr-0.5" />
                          {word.has_audio_count}/{word.entry_count}
                        </Badge>
                      )}
                    </div>

                    {/* アクション（ホバー時） */}
                    <div
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-300 hover:text-rose-500 hover:bg-rose-50"
                          >
                            <Trash2 size={12} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-3xl border-none p-8 max-w-[380px]">
                          <AlertDialogHeader className="space-y-4">
                            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                              <AlertCircle size={32} />
                            </div>
                            <div className="text-center space-y-2">
                              <AlertDialogTitle className="text-xl font-black text-slate-800">単語削除の確認</AlertDialogTitle>
                              <AlertDialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
                                <span className="font-bold text-slate-900">「{word.word_en}」</span>のすべての品詞エントリ（{word.entry_count}件）を削除しますか？<br />
                                音声ファイルも含め完全に削除されます。
                              </AlertDialogDescription>
                            </div>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="flex gap-3 mt-6">
                            <AlertDialogCancel className="flex-1 h-12 rounded-2xl border-none bg-slate-100 font-bold text-slate-500">
                              キャンセル
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteWord(word.word_en)}
                              className="flex-1 h-12 rounded-2xl bg-rose-500 text-white font-bold hover:bg-rose-600 shadow-lg"
                            >
                              削除する
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* フッター */}
      <div className="p-2 px-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
          Count: {filteredWords.length}
        </span>
      </div>
    </div>
  );
}
