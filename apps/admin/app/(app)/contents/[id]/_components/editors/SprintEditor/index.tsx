'use client';

import { useState, useEffect, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SPRINT_TYPES, SprintQuestionType, SprintQuestion } from '@gabby/types/sprint';
import { getSprintQuestionsByFilter } from '@/actions/adminSprintAction';
import { SprintQuestionList } from './SprintQuestionList';
import { SprintQuestionFormDialog } from './SprintQuestionFormDialog';
import { Loader2, Layers, Filter, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SprintTTSBulkDialog } from './SprintTTSBulkDialog';
import { Button } from '@/components/ui/button';

interface SprintEditorProps {
  contentId: string;
  initialType?: SprintQuestionType;
}

export function SprintEditor({ contentId, initialType }: SprintEditorProps) {
  const [selectedType, setSelectedType] = useState<SprintQuestionType>(initialType || '0');
  const [selectedLevel, setSelectedLevel] = useState<string>('1');
  const [questions, setQuestions] = useState<SprintQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchQuestions = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getSprintQuestionsByFilter(selectedType, Number(selectedLevel));
      setQuestions(data);
    } finally {
      setIsLoading(false);
    }
  }, [selectedType, selectedLevel]);

  useEffect(() => {
    // エフェクト内での同期的なsetState呼び出しによる警告を避けるため、
    // マイクロタスク（Promise）を使用して実行タイミングをずらします。
    const trigger = async () => {
      await Promise.resolve();
      fetchQuestions();
    };
    trigger();
  }, [fetchQuestions]);

  const typeMeta = SPRINT_TYPES[selectedType];
  const levels = Array.from(
    { length: typeMeta.maxLevel - typeMeta.minLevel + 1 },
    (_, i) => String(typeMeta.minLevel + i)
  );

  return (
    <div className="flex flex-col h-full bg-slate-50/30 overflow-hidden">
      {/* ツールバー */}
      <div className="shrink-0 p-4 px-6 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Filter size={12} /> Filter Settings
            </h2>
            <div className="flex items-center gap-3">
              {/* 種別選択 */}
              <Select value={selectedType} onValueChange={(v) => {
                setIsLoading(true);
                setSelectedType(v as SprintQuestionType);
                // 種別が変わったら最小レベルにリセット
                setSelectedLevel(String(SPRINT_TYPES[v as SprintQuestionType].minLevel));
              }}>
                <SelectTrigger className="w-[180px] h-10 bg-slate-50 border-slate-200 font-bold rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {Object.values(SPRINT_TYPES).map(t => (
                    <SelectItem key={t.value} value={t.value} className="font-medium">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* レベル選択 */}
              <Select value={selectedLevel} onValueChange={(v) => {
                setIsLoading(true);
                setSelectedLevel(v);
              }}>
                <SelectTrigger className="w-[120px] h-10 bg-slate-50 border-slate-200 font-bold rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {levels.map(l => (
                    <SelectItem key={l} value={l} className="font-mono">
                      {l === '0' ? 'Basic' : `Level ${l}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="h-10 w-px bg-slate-200 hidden sm:block mt-6" />

          <div className="mt-6 flex flex-col justify-end">
             <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-indigo-50 text-indigo-600 border-indigo-100 font-black">
                  {questions.length} Questions
                </Badge>
                {selectedType !== '0' && (
                   <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-100 font-black">
                    {new Set(questions.map(q => q.group_id)).size} Groups
                  </Badge>
                )}
             </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          {/* 一括音声生成ボタン */}
          <SprintTTSBulkDialog 
            questions={questions} 
            type={selectedType} 
            level={Number(selectedLevel)} 
            onComplete={fetchQuestions}
          >
            <Button variant="outline" className="border-indigo-100 text-indigo-600 font-bold h-10 rounded-xl gap-2 hover:bg-indigo-50">
              <Zap size={16} className="text-amber-500" fill="currentColor" />
              一括音声作成
            </Button>
          </SprintTTSBulkDialog>

          <SprintQuestionFormDialog 
            mode="create" 
            type={selectedType} 
            level={Number(selectedLevel)} 
            onSuccess={fetchQuestions} 
          />
        </div>
      </div>

      {/* リストエリア */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-300">
            <Loader2 className="animate-spin" size={32} />
            <span className="text-sm font-medium italic">Loading questions...</span>
          </div>
        ) : (
          <SprintQuestionList questions={questions} type={selectedType} onUpdate={fetchQuestions} />
        )}
      </div>
    </div>
  );
}