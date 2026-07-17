'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Plus, Trash2, AlertCircle, CheckCircle2,
  Music4, Headphones, Settings2, Zap,
} from 'lucide-react';
import { getCVDictionaryByWord, deleteCVDictionaryEntry, CVDictionaryEntry } from '@/actions/adminCVDictionaryAction';
import { useToast } from '@gabby/lib/hooks/useToast';
import { CVWordFormDialog } from './CVWordFormDialog';
import { CVTTSDialog } from './CVTTSDialog';
import { CVTTSBulkDialog } from './CVTTSBulkDialog';
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
} from '@/components/ui/alert-dialog';
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';
import { useCVDictionaryStore } from '@/stores/useCVDictionaryStore';
import { getPartOfSpeechTailwindColor } from '@gabby/types/colorVowel';

// ============================================================
// 定数
// ============================================================

const TTS_STATUS_CONFIG: Record<number, { label: string; className: string; icon: React.ElementType }> = {
  1: { label: '生成済', className: 'bg-emerald-50 text-emerald-600 border-emerald-100', icon: CheckCircle2 },
  2: { label: '要更新', className: 'bg-amber-50 text-amber-600 border-amber-100', icon: AlertCircle },
  9: { label: 'エラー', className: 'bg-rose-50 text-rose-600 border-rose-100', icon: AlertCircle },
};



// ============================================================
// Props
// ============================================================

interface CVEntryListProps {
  wordEn: string;
}

// ============================================================
// Component
// ============================================================

export function CVEntryList({ wordEn }: CVEntryListProps) {
  const { showToast } = useToast();
  const { play, isPlaying } = usePlayAudioSpeech();
  const [entries, setEntries] = useState<CVDictionaryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const lastUpdated = useCVDictionaryStore((s) => s.lastUpdated);

  // ----------------------------------------------------------
  // データ取得
  // ----------------------------------------------------------

  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getCVDictionaryByWord(wordEn);
      setEntries(data);
    } catch {
      showToast('エントリの取得に失敗しました', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [wordEn, showToast]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries, lastUpdated]);

  // ----------------------------------------------------------
  // 削除
  // ----------------------------------------------------------

  const handleDelete = async (wordEn: string, partOfSpeech: string) => {
    try {
      const result = await deleteCVDictionaryEntry(wordEn, partOfSpeech);
      if (result.success) {
        showToast('エントリを削除しました', 'success');
        fetchEntries();
      } else {
        showToast(result.message || '削除に失敗しました', 'error');
      }
    } catch {
      showToast('システムエラーが発生しました', 'error');
    }
  };

  // ----------------------------------------------------------
  // TTS ステータスバッジ
  // ----------------------------------------------------------

  const renderStatusBadge = (status: number) => {
    const config = TTS_STATUS_CONFIG[status] ?? {
      label: '未生成',
      className: 'bg-slate-100 text-slate-400 border-slate-200',
      icon: Music4,
    };
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={cn('gap-1 font-bold py-0.5 px-2 text-[10px]', config.className)}>
        <Icon size={12} /> {config.label}
      </Badge>
    );
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="flex flex-col h-full bg-slate-50/50 min-w-0 overflow-hidden">
      {/* ヘッダー */}
      <div className="p-4 px-6 bg-white border-b border-slate-200 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">{wordEn}</h2>
            <Badge variant="secondary" className="bg-slate-100 text-slate-500 text-[10px] px-1.5 h-4">
              {entries.length}
            </Badge>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">品詞別エントリと音声の管理</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* 一括音声生成 */}
          <CVTTSBulkDialog onComplete={fetchEntries}>
            <Button variant="outline" size="sm" className="h-8 text-xs font-bold border-slate-200 text-slate-500 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 gap-1.5">
              <Zap size={13} /> 一括音声
            </Button>
          </CVTTSBulkDialog>

          {/* 品詞追加 */}
          <CVWordFormDialog fixedWordEn={wordEn} onSuccess={fetchEntries} />
        </div>
      </div>

      {/* リストエリア */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-300">
              <Loader2 className="animate-spin" size={32} />
              <span className="text-sm font-medium italic">Loading entries...</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-3xl bg-white/50 text-slate-400 gap-4">
              <div className="p-4 bg-white rounded-full shadow-sm">
                <Plus size={24} className="text-slate-200" />
              </div>
              <p className="text-sm font-bold">エントリが登録されていません</p>
            </div>
          ) : (
            <div className="space-y-4 max-w-5xl mx-auto">
              {entries.map((entry) => (
                <div
                  key={`${entry.word_en}-${entry.part_of_speech}`}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group hover:border-indigo-300 hover:shadow-md transition-all duration-300"
                >
                  <div className="p-5 flex gap-5">
                    {/* 左：品詞バッジ */}
                    <div className="flex flex-col items-center shrink-0 pt-1">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-black px-2 py-1 rounded-lg border',
                          getPartOfSpeechTailwindColor(entry.part_of_speech)
                        )}
                      >
                        {entry.part_of_speech}
                      </Badge>
                    </div>

                    {/* 中央：メインコンテンツ */}
                    <div className="flex-1 min-w-0 space-y-3">
                      {/* 日本語訳 */}
                      <div className="text-base font-bold text-slate-900 leading-snug">{entry.word_ja}</div>

                      {/* 詳細情報グリッド */}
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                        {entry.syllables && (
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <span className="text-slate-300 font-black uppercase text-[9px] w-16 shrink-0">Syllables</span>
                            <span className="font-mono font-bold">{entry.syllables}</span>
                            {entry.primary_stress_syllable && (
                              <span className="text-slate-300 text-[9px]">(#{entry.primary_stress_syllable})</span>
                            )}
                          </div>
                        )}
                        {entry.phonetic_spelling && (
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <span className="text-slate-300 font-black uppercase text-[9px] w-16 shrink-0">Phonetic</span>
                            <span className="font-mono">{entry.phonetic_spelling}</span>
                          </div>
                        )}
                        {entry.stress_vowel_spelling && (
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <span className="text-slate-300 font-black uppercase text-[9px] w-16 shrink-0">Vowel</span>
                            <span className="font-mono font-bold">{entry.stress_vowel_spelling}</span>
                          </div>
                        )}
                        {entry.cv_id && (
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <span className="text-slate-300 font-black uppercase text-[9px] w-16 shrink-0">CV ID</span>
                            <span className="font-mono text-indigo-600 font-bold">{entry.cv_id}</span>
                          </div>
                        )}
                      </div>

                      {/* ステータスと再生 */}
                      <div className="pt-1 flex items-center gap-3">
                        {renderStatusBadge(entry.tts_status)}
                        {entry.audio_path && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!!isPlaying && isPlaying !== `${entry.word_en}-${entry.part_of_speech}`}
                            onClick={() => play(entry.audio_path!, `${entry.word_en}-${entry.part_of_speech}`)}
                            className={cn(
                              'h-7 px-2.5 gap-1.5 rounded-lg border transition-all',
                              isPlaying === `${entry.word_en}-${entry.part_of_speech}`
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-600 shadow-sm'
                                : 'text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 border-transparent hover:border-indigo-100'
                            )}
                          >
                            {isPlaying === `${entry.word_en}-${entry.part_of_speech}` ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Headphones size={14} />
                            )}
                            <span className="text-[11px] font-bold">
                              {isPlaying === `${entry.word_en}-${entry.part_of_speech}` ? 'Playing...' : 'Listen'}
                            </span>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* 右：アクション */}
                    <div className="flex flex-col gap-2 shrink-0">
                      {/* 編集 */}
                      <CVWordFormDialog mode="edit" initialData={entry} onSuccess={fetchEntries} />

                      {/* TTS */}
                      <CVTTSDialog entry={entry} onUpdate={fetchEntries}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 w-9 p-0 border-slate-200 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 rounded-xl transition-all"
                          title="音声作成"
                        >
                          <Settings2 size={16} />
                        </Button>
                      </CVTTSDialog>

                      {/* 削除 */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 w-9 p-0 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-3xl border-none p-8 max-w-[400px]">
                          <AlertDialogHeader className="space-y-4">
                            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                              <AlertCircle size={32} />
                            </div>
                            <div className="text-center space-y-2">
                              <AlertDialogTitle className="text-xl font-black text-slate-800">エントリの削除</AlertDialogTitle>
                              <AlertDialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
                                <span className="font-bold text-slate-900">「{entry.word_en} ({entry.part_of_speech})」</span>を削除しますか？<br />
                                音声ファイルも同時に削除されます。
                              </AlertDialogDescription>
                            </div>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="flex gap-3 mt-6">
                            <AlertDialogCancel className="flex-1 h-12 rounded-2xl border-none bg-slate-100 font-bold text-slate-500 hover:bg-slate-200">
                              キャンセル
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(entry.word_en, entry.part_of_speech)}
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
