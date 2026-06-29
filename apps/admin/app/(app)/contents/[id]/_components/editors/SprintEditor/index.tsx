// apps\admin\app\(app)\contents\[id]\_components\editors\SprintEditor\index.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QUESTION_TYPES, SprintQuestionType, SprintQuestion } from '@gabby/types/sprint';
import { Content } from '@gabby/types/content';
import { useMemo } from 'react';
import { getSprintQuestionsByFilter } from '@/actions/adminSprintAction';
import { SprintQuestionList } from './SprintQuestionList';
import { SprintQuestionFormDialog } from './SprintQuestionFormDialog';
import { Loader2, Filter, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SprintTTSBulkDialog } from './SprintTTSBulkDialog';
import { Button } from '@/components/ui/button';
import { SprintBulkImportDialog } from './SprintBulkImportDialog';

interface SprintEditorProps {
  contentId: string;
  initialType?: SprintQuestionType;
  content: Content;
}

export function SprintEditor({ contentId, initialType, content }: SprintEditorProps) {
  const [selectedType, setSelectedType] = useState<SprintQuestionType>(initialType || '0');
  const [selectedLevel, setSelectedLevel] = useState<string>('1');
  const [questions, setQuestions] = useState<SprintQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchQuestions = useCallback(async () => {
    try {
      setIsLoading(true);
      // 💡 修正: DDLの変更に伴い、将来的な拡張も見据えて contentId も含めてアクションに渡せるように口を確保します。
      // 現状の汎用フィルタ用アクションのシグネチャに合わせて取得
      const data = await getSprintQuestionsByFilter(contentId, selectedType, Number(selectedLevel));
      setQuestions(data);
    } finally {
      setIsLoading(false);
    }
  }, [contentId, selectedType, selectedLevel]);

  useEffect(() => {
    // 💡 修正: 不要なマイクロタスクを排除し、useEffect の標準パターンに則って
    // 安全かつシンプルにフェッチ関数を呼び出します。
    fetchQuestions();
  }, [fetchQuestions]);

  const sprintMeta = useMemo(() => content.metadata?.sprint, [content]);

  const hasLevel = useMemo(() => {
    if (sprintMeta && sprintMeta.sprint_type === '1') {
      return sprintMeta.has_level;
    }
    return true;
  }, [sprintMeta]);

  const availableTypes = useMemo(() => {
    if (!sprintMeta || sprintMeta.sprint_type !== '1') {
      return Object.values(QUESTION_TYPES);
    }
    const supportedTypes = sprintMeta.supported_types;
    if (!supportedTypes) {
      return Object.values(QUESTION_TYPES);
    }
    return Object.values(QUESTION_TYPES).filter(t => {
      if (t.value === '0') return supportedTypes.speed;
      if (t.value === '4') return supportedTypes.structure;
      if (t.value === '5') return supportedTypes.builders;
      if (t.value === '6') return supportedTypes.mastery;
      return false;
    });
  }, [sprintMeta]);

  // 選択可能な種別やレベル概念の変更による状態の整合性確保
  useEffect(() => {
    if (availableTypes.length > 0) {
      const isCurrentAvailable = availableTypes.some(t => t.value === selectedType);
      if (!isCurrentAvailable) {
        const fallbackType = availableTypes[0].value;
        setSelectedType(fallbackType);
        setSelectedLevel(hasLevel ? String(QUESTION_TYPES[fallbackType].minLevel) : '1');
      } else if (!hasLevel && selectedLevel !== '1') {
        setSelectedLevel('1');
      }
    }
  }, [availableTypes, selectedType, hasLevel, selectedLevel]);

  const typeMeta = QUESTION_TYPES[selectedType];
  const levels = useMemo(() => {
    if (!hasLevel) return ['1'];
    return Array.from(
      { length: typeMeta.maxLevel - typeMeta.minLevel + 1 },
      (_, i) => String(typeMeta.minLevel + i)
    );
  }, [typeMeta, hasLevel]);

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
                const nextType = v as SprintQuestionType;
                setSelectedType(nextType);
                setSelectedLevel(hasLevel ? String(QUESTION_TYPES[nextType].minLevel) : '1');
              }}>
                <SelectTrigger className="w-[180px] h-10 bg-slate-50 border-slate-200 font-bold rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {availableTypes.map(t => (
                    <SelectItem key={t.value} value={t.value} className="font-medium">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* レベル選択 */}
              <Select 
                value={selectedLevel} 
                onValueChange={(v) => {
                  setIsLoading(true);
                  setSelectedLevel(v);
                }}
                disabled={!hasLevel}
              >
                <SelectTrigger className="w-[120px] h-10 bg-slate-50 border-slate-200 font-bold rounded-xl disabled:opacity-50">
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

          {/* CSV問題一括登録ダイアログ */}
          <SprintBulkImportDialog
            contentId={contentId}
            type={selectedType}
            level={Number(selectedLevel)}
            onSuccess={fetchQuestions}
          />

          {/* 新規追加フォーム */}
          <SprintQuestionFormDialog 
            mode="create" 
            type={selectedType} 
            level={Number(selectedLevel)} 
            onSuccess={fetchQuestions} 
            contentId={contentId}
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
          <SprintQuestionList questions={questions} type={selectedType} onUpdate={fetchQuestions} contentId={contentId} />
        )}
      </div>
    </div>
  );
}