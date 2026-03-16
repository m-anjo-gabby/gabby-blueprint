'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { getWordsByContentId, createWord, deleteWord } from '@/actions/adminWordAction';
import { WordRecord } from '@/types/word'; 
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

interface WordListProps {
  contentId: string;
  selectedWordId?: string;
}

export function WordList({ contentId, selectedWordId }: WordListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();

  const [words, setWords] = useState<WordRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 新規登録用ステート
  const [newWordEn, setNewWordEn] = useState('');
  const [newWordJa, setNewWordJa] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // 1. 単語一覧の取得
  useEffect(() => {
    const fetchWords = async () => {
      setIsLoading(true);
      try {
        const data = await getWordsByContentId(contentId);
        setWords(data);
      } catch (error) {
        showToast("単語の取得に失敗しました", "error");
      } finally {
        setIsLoading(false);
      }
    };
    fetchWords();
  }, [contentId, showToast]);

  // 2. 単語の追加
  const handleAddWord = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newWordEn || !newWordJa) return;

    setIsAdding(true);
    try {
      const result = await createWord(contentId, newWordEn, newWordJa);
      if (result.success && result.data) {
        setWords([...words, result.data]);
        setNewWordEn('');
        setNewWordJa('');
        // 登録後、そのままその単語を選択状態にする
        handleSelect(result.data.word_id);
      }
    } catch (error) {
      showToast("登録に失敗しました", "error");
    } finally {
      setIsAdding(false);
    }
  };

  // 3. 単語の選択（URLクエリパラメータの更新）
  const handleSelect = (id: string) => {
    router.push(`${pathname}?wordId=${id}`);
  };

  const filteredWords = words.filter(w => 
    w.word_en.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.word_ja.includes(searchQuery)
  );

  return (
    // min-w-0 と overflow-hidden で親パネルを押し広げないようにする
    <div className="flex flex-col h-full bg-white min-w-0 overflow-hidden">
      
      {/* 検索・ツールバー */}
      <div className="p-4 border-b border-slate-100 space-y-3 min-w-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <Input 
            placeholder="単語を検索..." 
            className="pl-9 bg-slate-50 border-none focus-visible:ring-1 focus-visible:ring-indigo-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 新規登録行（インライン） */}
      {/* gap-2 と min-w-0 を適用して、狭い幅でも要素が折り返したりはみ出したりしないようにする */}
      <form onSubmit={handleAddWord} className="p-3 bg-indigo-50/50 border-b border-indigo-100 flex gap-2 min-w-0">
        <Input 
          placeholder="English" 
          className="bg-white border-indigo-200 min-w-0 flex-1 h-9 text-sm" 
          value={newWordEn}
          onChange={(e) => setNewWordEn(e.target.value)}
        />
        <Input 
          placeholder="日本語" 
          className="bg-white border-indigo-200 min-w-0 flex-1 h-9 text-sm" 
          value={newWordJa}
          onChange={(e) => setNewWordJa(e.target.value)}
        />
        <Button size="icon" type="submit" disabled={isAdding || !newWordEn} className="shrink-0 h-9 w-9 bg-indigo-600 hover:bg-indigo-700">
          {isAdding ? <Loader2 className="animate-spin" size={16} /> : <Plus size={18} />}
        </Button>
      </form>

      {/* リストエリア */}
      <ScrollArea className="flex-1 min-w-0">
        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="animate-spin text-slate-300" /></div>
        ) : (
          <div className="divide-y divide-slate-50 min-w-0">
            {filteredWords.map((word) => (
              <div 
                key={word.word_id}
                onClick={() => handleSelect(word.word_id)}
                className={cn(
                  "group flex items-center p-3 cursor-pointer transition-colors hover:bg-slate-50 min-w-0",
                  selectedWordId === word.word_id ? "bg-indigo-50 border-l-4 border-indigo-500" : "border-l-4 border-transparent"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">{word.word_en}</div>
                  <div className="text-xs text-slate-500 truncate">{word.word_ja}</div>
                </div>
                
                {/* 操作ボタン（ホバー時に表示） */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-slate-400 hover:text-rose-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      // 削除処理は別途実装
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* フッター（件数表示） */}
      <div className="p-2 px-4 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 font-bold uppercase tracking-wider shrink-0">
        Total: {filteredWords.length} Words
      </div>
    </div>
  );
}