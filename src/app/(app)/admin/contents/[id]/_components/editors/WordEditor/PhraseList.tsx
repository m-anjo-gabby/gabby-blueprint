'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, Plus, Volume2, Settings2, Trash2, 
  AlertCircle, CheckCircle2, Music4, Headphones 
} from 'lucide-react';
import { getPhrasesByWordId } from '@/actions/adminPhraseAction';
import { PhraseRecord } from '@/types/word';
import { useToast } from '@/hooks/useToast';
import { TTSDialog } from './TTSDialog';
import { cn } from '@/lib/utils';

interface PhraseListProps {
  wordId: string;
}

export function PhraseList({ wordId }: PhraseListProps) {
  const { showToast } = useToast();
  const [phrases, setPhrases] = useState<PhraseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // フェッチ処理の共通化
  const fetchPhrases = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getPhrasesByWordId(wordId);
      setPhrases(data);
    } catch (error) {
      showToast("フレーズの取得に失敗しました", "error");
    } finally {
      setIsLoading(false);
    }
  }, [wordId, showToast]);

  useEffect(() => {
    fetchPhrases();
  }, [fetchPhrases]);

  // TTSステータスバッジ
  const renderStatusBadge = (status: number) => {
    const configs: Record<number, { label: string; icon: any; className: string }> = {
      1: { label: "生成済", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-600 border-emerald-100" },
      2: { label: "要更新", icon: AlertCircle, className: "bg-amber-50 text-amber-600 border-amber-100" },
      9: { label: "エラー", icon: AlertCircle, className: "bg-rose-50 text-rose-600 border-rose-100" },
    };

    const config = configs[status] || { label: "未生成", icon: Music4, className: "bg-slate-100 text-slate-400 border-slate-200" };
    const Icon = config.icon;

    return (
      <Badge variant="outline" className={cn("gap-1 font-bold py-0.5", config.className)}>
        <Icon size={12} />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 min-w-0 overflow-hidden">
      {/* ヘッダー：情報の階層を整理 */}
      <div className="p-4 px-6 bg-white border-b border-slate-200 flex justify-between items-center sticky top-0 z-10">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Phrases / Sentences</h2>
            <Badge variant="secondary" className="bg-slate-100 text-slate-500 text-[10px]">{phrases.length}</Badge>
          </div>
          <p className="text-[11px] text-slate-400 font-medium truncate">単語に関連する例文と音声の管理</p>
        </div>
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-xs gap-1.5 h-8 px-4 shrink-0 shadow-sm transition-all active:scale-95">
          <Plus size={14} /> フレーズ追加
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-300">
              <Loader2 className="animate-spin" size={32} />
              <span className="text-sm font-medium">Loading phrases...</span>
            </div>
          ) : phrases.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-3xl bg-white/50 text-slate-400 gap-4">
              <div className="p-4 bg-white rounded-full shadow-sm">
                <Plus size={24} className="text-slate-300" />
              </div>
              <p className="text-sm font-medium">フレーズが登録されていません</p>
            </div>
          ) : (
            <div className="space-y-3 max-w-5xl mx-auto">
              {phrases.map((phrase) => (
                <div 
                  key={phrase.phrase_id} 
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group hover:border-indigo-400 hover:shadow-md transition-all duration-200"
                >
                  <div className="p-5 flex gap-5">
                    {/* 左側：順序表示 */}
                    <div className="flex flex-col items-center shrink-0 pt-1">
                      <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-xs font-black text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                        {phrase.seq_no}
                      </div>
                      <span className="mt-2 text-[9px] font-black text-slate-300 uppercase tracking-widest">
                        T-{phrase.phrase_type}
                      </span>
                    </div>

                    {/* 中央：テキストコンテンツ */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="space-y-1">
                        <div className="text-[17px] font-bold text-slate-900 leading-tight tracking-tight break-words">
                          {phrase.phrase_en}
                        </div>
                        <div className="text-sm text-slate-500 font-medium leading-relaxed">
                          {phrase.phrase_ja}
                        </div>
                      </div>
                      
                      {/* 下部：ステータス・音声 */}
                      <div className="pt-2 flex items-center gap-4">
                        {renderStatusBadge(phrase.tts_status)}
                        
                        {phrase.audio_path && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 gap-1.5 rounded-lg">
                            <Headphones size={14} />
                            <span className="text-[11px] font-bold">Listen</span>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* 右側：アクションボタン */}
                    <div className="flex flex-col gap-2 shrink-0">
                      <TTSDialog 
                        phrase={phrase} 
                        onUpdate={fetchPhrases}
                      >
                        <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-slate-200 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 rounded-xl transition-all">
                          <Settings2 size={16} />
                        </Button>
                      </TTSDialog>
                      <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}