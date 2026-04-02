'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search, Trash2, Hash, AlertCircle } from 'lucide-react';
import { getWordsByContentId, deleteWord } from '@/actions/adminWordAction';
import { WordRecord, WORD_STATUS } from '@/types/word'; 
import { cn } from '@/lib/utils';
import { useToast } from '@gabby/lib/hooks/useToast';
import { WordFormDialog } from './WordFormDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useWordStore } from '@/stores/useWordStore';

interface WordListProps {
  contentId: string;
}

export function WordList({ contentId }: WordListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedWordId = searchParams.get('wordId');
  const { showToast } = useToast();

  const [words, setWords] = useState<WordRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const lastUpdated = useWordStore((state) => state.lastUpdated);
  const setSelectedWord = useWordStore((state) => state.setSelectedWord); // ストアのアクションを取得
  
  const fetchWords = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getWordsByContentId(contentId);
      setWords(data);
    } catch (error) {
      showToast("単語の取得に失敗しました", "error");
    } finally {
      setIsLoading(false);
    }
  }, [contentId, showToast]);

  useEffect(() => {
    fetchWords();
  }, [fetchWords, lastUpdated]);

  /**
   * 初期読み込み時、またはURLのwordIdが変わった際の同期処理
   */
  useEffect(() => {
    if (words.length > 0 && selectedWordId) {
      const currentWord = words.find(w => w.word_id === selectedWordId);
      if (currentWord) {
        setSelectedWord(currentWord);
      }
    } else if (!selectedWordId) {
      setSelectedWord(null);
    }
  }, [selectedWordId, words, setSelectedWord]);

  /**
   * 単語選択時
   */
  const handleSelect = (word: WordRecord) => {
    // 1. URLを更新
    router.push(`${pathname}?wordId=${word.word_id}`);
    // 2. ストアに単語オブジェクトをまるごと保存
    setSelectedWord(word);
  };

  const filteredWords = words.filter(w => 
    w.word_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.word_ja.includes(searchQuery)
  );

  /**
   * 単語の削除実行
   */
  const handleDelete = async (wordId: string) => {
    // AlertDialogAction の onClick は MouseEvent を渡さない場合があるため、
    // 引数は wordId のみに絞るのが安全です。
    try {
      const result = await deleteWord(wordId);
      
      if (result.success) {
        showToast("単語を削除しました", "success");

        // アクション側で revalidatePath されていますが、
        // クライアントサイドの state を即時更新するために fetchWords を呼びます
        await fetchWords();

        // 削除した単語が現在選択中の単語なら、右パネルを閉じるために URL をクリア
        if (selectedWordId === wordId) {
          router.push(pathname);
        }
      } else {
        showToast(result.message || "削除に失敗しました", "error");
      }
    } catch (error) {
      console.error("Delete Error:", error);
      showToast("システムエラーが発生しました", "error");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white min-w-0 overflow-hidden border-r border-slate-200">
      {/* 検索・アクションツールバー */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
        <div className="flex items-center justify-between gap-2">
           <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Vocabulary</h2>
           <WordFormDialog mode="create" contentId={contentId} onSuccess={fetchWords} />
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

      {/* リストエリア */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="animate-spin text-slate-200" /></div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filteredWords.map((word) => {
              const statusConfig = WORD_STATUS[word.status];
              return (
                <div 
                  key={word.word_id}
                  onClick={() => handleSelect(word)}
                  className={cn(
                    "group relative flex flex-col p-3 px-4 cursor-pointer transition-all hover:bg-slate-50 border-l-4",
                    selectedWordId === word.word_id ? "bg-indigo-50/50 border-indigo-500" : "border-transparent"
                  )}
                >
                  {/* 1段目: Rank + English */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-black text-slate-300 w-5">
                      {word.frequency_rank}
                    </span>
                    <div className="text-sm font-black text-slate-800 truncate flex-1">
                      {word.word_en}
                    </div>
                  </div>

                  {/* 2段目: Japanese */}
                  <div className="pl-7 text-[11px] font-medium text-slate-400 truncate mt-0.5">
                    {word.word_ja}
                  </div>

                  {/* 3段目: Status Badge */}
                  <div className="pl-7 mt-2 flex items-center justify-between">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px] px-1.5 py-0 font-bold uppercase border-none",
                        statusConfig.color === 'emerald' ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                      )}
                    >
                      {statusConfig.label}
                    </Badge>

                    {/* アクションボタン（ホバー時のみ） */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {/* 編集ボタン */}
                      <WordFormDialog mode="edit" initialData={word} contentId={contentId} onSuccess={fetchWords} />
                      
                      {/* 削除ダイアログ */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-300 hover:text-rose-500 hover:bg-rose-50"
                          >
                            <Trash2 size={13} />
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
                                <span className="font-bold text-slate-900">「{word.word_en}」</span>を削除しますか？<br />
                                この操作により、紐づく例文もすべて削除されます。
                              </AlertDialogDescription>
                            </div>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="flex gap-3 mt-6">
                            <AlertDialogCancel className="flex-1 h-12 rounded-2xl border-none bg-slate-100 font-bold text-slate-500">
                              キャンセル
                            </AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDelete(word.word_id)}
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
        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Count: {filteredWords.length}</span>
      </div>
    </div>
  );
}