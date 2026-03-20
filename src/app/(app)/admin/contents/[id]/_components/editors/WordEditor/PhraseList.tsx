'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, Plus, Settings2, Trash2, 
  AlertCircle, CheckCircle2, Music4, Headphones 
} from 'lucide-react';
import { 
  getPhrasesByWordId, 
  deletePhrase 
} from '@/actions/adminWordAction';
import { PhraseRecord } from '@/types/word';
import { useToast } from '@/hooks/useToast';
import { TTSDialog } from './TTSDialog';
import { PhraseFormDialog } from './PhraseFormDialog';
import { cn } from '@/lib/utils';
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
} from "@/components/ui/alert-dialog";
import { useAudioPlayer } from '@/hooks/useAudioPlayer';

interface PhraseListProps {
  wordId: string;
}

/**
 * 単語詳細パネル：フレーズ（例文）の一覧表示と管理を行うコンポーネント
 */
export function PhraseList({ wordId }: PhraseListProps) {
  const { showToast } = useToast();
  const { play, isPlaying } = useAudioPlayer();
  const [phrases, setPhrases] = useState<PhraseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * フレーズ一覧の取得：wordIdが変更されるたびに実行
   */
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

  /**
   * フレーズの削除実行
   */
  const handleDelete = async (phraseId: string, audioPath?: string | null) => {
    try {
      // phraseId と audioPath を渡す
      const result = await deletePhrase(phraseId, audioPath); 
      if (result.success) {
        showToast("フレーズを削除しました", "success");
        fetchPhrases();
      } else {
        showToast(result.message || "削除に失敗しました", "error");
      }
    } catch (error) {
      showToast("システムエラーが発生しました", "error");
    }
  };

  /**
   * TTS（音声生成）ステータスに応じたバッジのレンダリング
   */
  const renderStatusBadge = (status: number) => {
    const configs: Record<number, { label: string; icon: any; className: string }> = {
      1: { label: "生成済", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-600 border-emerald-100" },
      2: { label: "要更新", icon: AlertCircle, className: "bg-amber-50 text-amber-600 border-amber-100" },
      9: { label: "エラー", icon: AlertCircle, className: "bg-rose-50 text-rose-600 border-rose-100" },
    };

    const config = configs[status] || { label: "未生成", icon: Music4, className: "bg-slate-100 text-slate-400 border-slate-200" };
    const Icon = config.icon;

    return (
      <Badge variant="outline" className={cn("gap-1 font-bold py-0.5 px-2 text-[10px]", config.className)}>
        <Icon size={12} />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 min-w-0 overflow-hidden">
      {/* ヘッダーセクション 
      */}
      <div className="p-4 px-6 bg-white border-b border-slate-200 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Phrases / Sentences</h2>
            <Badge variant="secondary" className="bg-slate-100 text-slate-500 text-[10px] px-1.5 h-4">
              {phrases.length}
            </Badge>
          </div>
          <p className="text-[11px] text-slate-400 font-medium truncate">単語に関連する例文と音声の管理</p>
        </div>
        
        {/* 新規登録ダイアログ */}
        <PhraseFormDialog mode="create" wordId={wordId} onSuccess={fetchPhrases} />
      </div>

      {/* メインリストエリア 
      */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-300">
              <Loader2 className="animate-spin" size={32} />
              <span className="text-sm font-medium italic">Loading phrases...</span>
            </div>
          ) : phrases.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-3xl bg-white/50 text-slate-400 gap-4">
              <div className="p-4 bg-white rounded-full shadow-sm">
                <Plus size={24} className="text-slate-200" />
              </div>
              <p className="text-sm font-bold">フレーズが登録されていません</p>
            </div>
          ) : (
            <div className="space-y-4 max-w-5xl mx-auto">
              {phrases.map((phrase) => (
                <div 
                  key={phrase.phrase_id} 
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group hover:border-indigo-300 hover:shadow-md transition-all duration-300"
                >
                  <div className="p-5 flex gap-5">
                    {/* 左：順序・タイプ表示 */}
                    <div className="flex flex-col items-center shrink-0 pt-1">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-sm font-black text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                        {phrase.seq_no}
                      </div>
                      <span className="mt-2 text-[9px] font-black text-slate-300 uppercase tracking-widest">
                        Type-{phrase.phrase_type}
                      </span>
                    </div>

                    {/* 中央：英文・和訳コンテンツ */}
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="space-y-1.5">
                        <div className="text-[17px] font-bold text-slate-900 leading-snug tracking-tight break-words">
                          {phrase.phrase_en}
                        </div>
                        <div className="text-[13px] text-slate-500 font-medium leading-relaxed">
                          {phrase.phrase_ja}
                        </div>
                      </div>
                      
                      {/* ステータスと再生ボタン */}
                      <div className="pt-1 flex items-center gap-4">
                        {renderStatusBadge(phrase.tts_status)}
                        
                      {phrase.audio_path && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            disabled={!!isPlaying && isPlaying !== phrase.phrase_id} // 他を再生中は無効化（任意）
                            onClick={() => play(phrase.audio_path!, phrase.phrase_id)}
                            className={cn(
                              "h-7 px-2.5 gap-1.5 rounded-lg border transition-all",
                              isPlaying === phrase.phrase_id 
                                ? "bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-600 shadow-sm" 
                                : "text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 border-transparent hover:border-indigo-100"
                            )}
                          >
                            {isPlaying === phrase.phrase_id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Headphones size={14} />
                            )}
                            <span className="text-[11px] font-bold">
                              {isPlaying === phrase.phrase_id ? "Playing..." : "Listen"}
                            </span>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* 右：アクションツールバー */}
                    <div className="flex flex-col gap-2 shrink-0">
                      {/* 編集 */}
                      <PhraseFormDialog mode="edit" initialData={phrase} wordId={wordId} onSuccess={fetchPhrases} />

                      {/* TTS設定ダイアログ */}
                      <TTSDialog phrase={phrase} onUpdate={fetchPhrases}>
                        <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-slate-200 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 rounded-xl transition-all">
                          <Settings2 size={16} />
                        </Button>
                      </TTSDialog>

                      {/* 削除確認（AlertDialog） */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                            <Trash2 size={16} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-3xl border-none p-8 max-w-[400px]">
                          <AlertDialogHeader className="space-y-4">
                            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                              <AlertCircle size={32} />
                            </div>
                            <div className="text-center space-y-2">
                              <AlertDialogTitle className="text-xl font-black text-slate-800">フレーズの削除</AlertDialogTitle>
                              <AlertDialogDescription className="text-xs font-medium text-slate-500 leading-relaxed italic">
                                {phrase.phrase_en.substring(0, 40)}{phrase.phrase_en.length > 40 ? '...' : ''}
                                <br />を削除します。この操作は取り消せません。
                              </AlertDialogDescription>
                            </div>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="flex gap-3 mt-6">
                            <AlertDialogCancel className="flex-1 h-12 rounded-2xl border-none bg-slate-100 font-bold text-slate-500 hover:bg-slate-200">
                              キャンセル
                            </AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDelete(phrase.phrase_id, phrase.audio_path)}
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
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}