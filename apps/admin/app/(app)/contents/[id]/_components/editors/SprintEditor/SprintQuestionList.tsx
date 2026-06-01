'use client';

import { useMemo } from 'react';
import { SprintQuestion, SprintQuestionType } from '@gabby/types/sprint';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  PlayCircle, MessageSquare, HelpCircle, CheckCircle2, 
  Trash2, Edit, Settings2, MoreVertical, 
  AlertCircle, Music4, Headphones, Layout
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SprintQuestionFormDialog } from './SprintQuestionFormDialog';
import { deleteSprintQuestion } from '@/actions/adminSprintAction';
import { useToast } from '@gabby/lib/hooks/useToast';
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
import { usePlayAudioSpeech } from '@gabby/lib/hooks/usePlayAudioSpeech';

interface SprintQuestionListProps {
  questions: SprintQuestion[];
  type: SprintQuestionType;
  onUpdate: () => void;
}

export function SprintQuestionList({ questions, type, onUpdate }: SprintQuestionListProps) {
  const { showToast } = useToast();
  const { play, isPlaying } = usePlayAudioSpeech();
  const isSpeed = type === '0';
  const isCueType = type === '4' || type === '5'; // 指示/Cueタイプ
  const isMastery = type === '6';
  
  const questionLabel = isCueType ? "指示 / Cue" : "Question";

  // グループ化ロジック (Speed以外)
  const groupedQuestions = useMemo(() => {
    if (isSpeed) return questions.map(q => ({ groupId: q.question_id, items: [q] }));
    
    const groups: Record<string, SprintQuestion[]> = {};
    questions.forEach(q => {
      const gid = q.group_id || 'no-group';
      if (!groups[gid]) groups[gid] = [];
      groups[gid].push(q);
    });
    return Object.entries(groups).map(([groupId, items]) => ({ groupId, items }));
  }, [questions, isSpeed]);

  const handleDelete = async (id: string) => {
    const res = await deleteSprintQuestion(id);
    if (res.success) {
      showToast("削除しました", "success");
      onUpdate();
    } else {
      showToast(res.message || "削除に失敗しました", "error");
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-8 max-w-5xl mx-auto pb-32">
        {groupedQuestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 border-2 border-dashed border-slate-200 rounded-[40px] bg-white/50 text-slate-400 gap-4">
            <div className="p-4 bg-white rounded-full shadow-sm"><Layout size={32} className="text-slate-200" /></div>
            <p className="text-sm font-bold">問題が登録されていません</p>
          </div>
        ) : (
          groupedQuestions.map((group) => (
            <div key={group.groupId} className="space-y-4">
              {!isSpeed ? (
                /* Speed以外：グループ単位で1つのカード */
                <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 bg-slate-50/50 border-b border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                      <Badge className="bg-slate-900 text-white font-mono rounded-lg h-6 px-2.5">GROUP: {group.groupId.slice(0,8)}</Badge>
                      
                      {/* このグループに問題を追加するボタン */}
                      <SprintQuestionFormDialog 
                        mode="create" 
                        type={type} 
                        level={group.items[0].difficulty_level}
                        initialGroupId={group.groupId}
                        initialStatement={group.items[0].statement || ''}
                        initialStatementJa={group.items[0].statement_ja || ''}
                        onSuccess={onUpdate} 
                      />
                    </div>
                    {isMastery && group.items[0]?.statement && (
                      <div className="border-l-4 border-slate-300 pl-4 py-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Shared Statement</span>
                        <p className="text-sm font-bold text-slate-600">{group.items[0].statement}</p>
                      </div>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {group.items.map((q) => (
                      <div key={q.question_id} className="p-6 flex gap-5 hover:bg-indigo-50/20 transition-colors">
                        {/* 左：SEQ */}
                        <div className="flex flex-col items-center shrink-0">
                          <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-sm font-black text-slate-400">
                            {q.seq_no}
                          </div>
                        </div>

                        {/* 中央：コンテンツ */}
                        <div className="flex-1 min-w-0 space-y-4">
                          {/* Structure/Buildersの場合は各行にStatementを表示 */}
                          {isCueType && q.statement && (
                            <div className="border-l-4 border-slate-200 pl-4 py-0.5">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Statement</span>
                              <p className="text-xs font-bold text-slate-500">{q.statement}</p>
                            </div>
                          )}

                          <div className="border-l-4 border-indigo-500 pl-4 py-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{questionLabel}</span>
                              {q.question_voice && (
                                <Button variant="ghost" size="icon" className="h-5 w-5 text-indigo-400" onClick={() => play(q.question_voice!, q.question_id)}>
                                  <Headphones size={12} />
                                </Button>
                              )}
                            </div>
                            <p className="text-lg font-black text-slate-800 leading-tight">{q.question}</p>
                          </div>
                          <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3">
                            <span className="text-[9px] font-black text-emerald-500 uppercase block mb-1">Answer (Yes)</span>
                            <p className="text-sm font-bold text-emerald-700">{q.answer_sentence_yes}</p>
                          </div>
                        </div>

                        {/* 右：アクション */}
                        <div className="flex flex-col gap-2 shrink-0">
                          <SprintQuestionActionButtons q={q} type={type} onUpdate={onUpdate} handleDelete={handleDelete} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Speed：現状維持（一問一答の個別カード） */
                <div className="grid gap-4">
                  {group.items.map((q) => (
                    <div key={q.question_id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden group hover:border-indigo-300 transition-all duration-300">
                      <div className="p-5 flex gap-5">
                        <div className="flex flex-col items-center shrink-0">
                          <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-sm font-black text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                            {q.seq_no}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 space-y-4">
                          {q.statement && (
                            <div className="border-l-4 border-slate-100 pl-4 py-1">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Statement</span>
                              <p className="text-sm font-bold text-slate-600">{q.statement}</p>
                            </div>
                          )}
                          <div className="border-l-4 border-indigo-500 pl-4 py-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{questionLabel}</span>
                              {q.question_voice && (
                                <Button variant="ghost" size="icon" className="h-5 w-5 text-indigo-400" onClick={() => play(q.question_voice!, q.question_id)}>
                                  <Headphones size={12} />
                                </Button>
                              )}
                            </div>
                            <p className="text-lg font-black text-slate-800 leading-tight">{q.question}</p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3">
                              <span className="text-[9px] font-black text-emerald-500 uppercase block mb-1">Answer (Yes)</span>
                              <p className="text-sm font-bold text-emerald-700">{q.answer_sentence_yes}</p>
                            </div>
                            {q.answer_sentence_no && (
                              <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-3">
                                <span className="text-[9px] font-black text-amber-500 uppercase block mb-1">Answer (No)</span>
                                <p className="text-sm font-bold text-amber-700">{q.answer_sentence_no}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          <SprintQuestionActionButtons q={q} type={type} onUpdate={onUpdate} handleDelete={handleDelete} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  );
}

/* アクションボタン部分を共通化 */
function SprintQuestionActionButtons({ q, type, onUpdate, handleDelete }: { q: SprintQuestion, type: SprintQuestionType, onUpdate: () => void, handleDelete: (id: string) => void }) {
  return (
    <>
      <SprintQuestionFormDialog 
        mode="edit" 
        initialData={q} 
        type={type} 
        level={q.difficulty_level} 
        onSuccess={onUpdate} 
      />
      
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50">
            <Trash2 size={16} />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} />
            </div>
            <AlertDialogTitle className="text-center font-black">問題を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-xs">
              この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel className="flex-1 rounded-2xl">キャンセル</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => handleDelete(q.question_id)}
              className="flex-1 bg-rose-500 hover:bg-rose-600 rounded-2xl font-bold"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}