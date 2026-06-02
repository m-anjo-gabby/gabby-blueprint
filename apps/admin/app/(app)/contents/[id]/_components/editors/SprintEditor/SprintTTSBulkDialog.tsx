'use client';

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Zap, CheckCircle2, AlertCircle, FileAudio, RefreshCw, Volume2, AlertTriangle, ChevronRight, ArrowLeft } from 'lucide-react';
import { TTSParameters, usePlayAzureSpeech } from '@gabby/lib/hooks/usePlayAzureSpeech';
import { useToast } from '@gabby/lib/hooks/useToast';
import { AZURE_STYLES, AZURE_VOICES, AzureStyle, AzureVoice } from '@gabby/types/azure';
import { SprintQuestion, SprintQuestionType } from '@gabby/types/sprint';
import { saveSprintAudio } from '@/actions/adminSprintAction';

interface SprintTTSBulkDialogProps {
  questions: SprintQuestion[];
  type: SprintQuestionType;
  level: number;
  onComplete?: () => void;
  children: React.ReactNode;
}

const DEFAULT_PARAMS: TTSParameters = {
  voice: "en-US-JennyNeural",
  style: "friendly",
  rate: 1.0,
  pitch: 0,
};

const SAMPLE_TEXT = "This is a sample sentence for sprint audio settings.";

export function SprintTTSBulkDialog({ questions, type, level, onComplete, children }: SprintTTSBulkDialogProps) {
  const [open, setOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [targetMode, setTargetMode] = useState<'all' | 'missing'>('all');
  const [params, setParams] = useState<TTSParameters>(DEFAULT_PARAMS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [resultCounts, setResultCounts] = useState({ success: 0, error: 0 });

  const { speak, isSpeaking, generateSSML } = usePlayAzureSpeech();
  const { showToast } = useToast();

  // 実行タスク（問題×セクション）のリストを作成
  const allTasks = useMemo(() => {
    const tasks: { q: SprintQuestion; section: 'statement' | 'question' | 'answer_yes' | 'answer_no' }[] = [];
    const isSpeed = type === '0';

    questions.forEach(q => {
      // 基本文 (Speed以外)
      if (!isSpeed && q.statement) tasks.push({ q, section: 'statement' });
      // 質問・指示
      tasks.push({ q, section: 'question' });
      // 解答 Yes
      tasks.push({ q, section: 'answer_yes' });
      // 解答 No (Speedのみ)
      if (isSpeed && q.answer_sentence_no) tasks.push({ q, section: 'answer_no' });
    });

    return tasks;
  }, [questions, type]);

  const filteredTasks = useMemo(() => {
    if (targetMode === 'all') return allTasks;
    return allTasks.filter(task => {
      const prefix = task.section.startsWith('answer') ? `answer_sentence_${task.section.split('_')[1]}` : task.section;
      const statusKey = `${prefix}_tts_status` as keyof SprintQuestion;
      return task.q[statusKey] !== 1;
    });
  }, [allTasks, targetMode]);

  const handleOpenChange = (isOpen: boolean) => {
    if (isProcessing) return;
    setOpen(isOpen);
    if (isOpen) {
      setParams(DEFAULT_PARAMS);
      setStatus('idle');
      setShowConfirm(false);
    }
  };

  const handleBulkGenerate = async () => {
    setShowConfirm(false);
    setIsProcessing(true);
    setStatus('running');

    const total = filteredTasks.length;
    setProgress({ current: 0, total });
    let success = 0;
    let error = 0;

    for (let i = 0; i < total; i++) {
      const task = filteredTasks[i];
      setProgress(prev => ({ ...prev, current: i + 1 }));

      try {
        const textMap = {
          statement: task.q.statement,
          question: task.q.question,
          answer_yes: task.q.answer_sentence_yes,
          answer_no: task.q.answer_sentence_no,
        };
        const text = textMap[task.section] || '';
        const ssml = generateSSML(text, params);
        const voiceKey = `${task.section === 'answer_yes' || task.section === 'answer_no' ? `answer_sentence_${task.section.split('_')[1]}` : task.section}_voice` as keyof SprintQuestion;
        const currentPath = task.q[voiceKey] as string | null;

        const res = await saveSprintAudio(
          task.q.question_id,
          task.section,
          type,
          level,
          ssml,
          'auto',
          { settings: params, words: [] },
          currentPath
        );

        if (res.success) success++; else error++;
      } catch (e) {
        error++;
      }
    }

    setResultCounts({ success, error });
    setIsProcessing(false);
    if (error === 0) {
      setStatus('completed');
      setTimeout(() => { setOpen(false); if (onComplete) onComplete(); }, 1500);
    } else {
      setStatus('error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-3xl border-none shadow-2xl flex flex-col focus:outline-none">
        <DialogHeader className="p-8 bg-slate-900 text-white border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 font-black text-xl">
            <Zap className="text-amber-400" size={24} fill="currentColor" />
            Sprint Bulk Generator
          </DialogTitle>
        </DialogHeader>

        <div className="p-8 space-y-8 bg-white overflow-y-auto">
          {status === 'idle' ? (
            <>
              <div className="space-y-3">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Step 1: Scope</Label>
                <Tabs value={targetMode} onValueChange={(v) => setTargetMode(v as any)} className="w-full">
                  <TabsList className="grid grid-cols-2 w-full bg-slate-100 p-1 h-11 border border-slate-200">
                    <TabsTrigger value="all" className="font-bold gap-2 text-xs">
                      <RefreshCw size={14} /> Re-generate All
                    </TabsTrigger>
                    <TabsTrigger value="missing" className="font-bold gap-2 text-xs">
                      <FileAudio size={14} /> Missing Only
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <p className="text-[10px] text-right font-bold text-slate-400">Target: <span className="text-indigo-600">{filteredTasks.length}</span> audio segments</p>
              </div>

              <div className="space-y-5 pt-6 border-t border-dashed border-slate-200">
                <div className="flex justify-between items-center">
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Step 2: Settings</Label>
                  <Button variant="ghost" size="sm" onClick={() => speak(SAMPLE_TEXT, params)} disabled={isSpeaking} className="h-8 text-[10px] font-bold text-indigo-600 gap-1.5 px-3 rounded-full border border-indigo-100">
                    {isSpeaking ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />} TEST VOICE
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <Select value={params.voice} onValueChange={(v) => setParams(p => ({...p, voice: v as AzureVoice}))}>
                    <SelectTrigger className="bg-slate-50 border-slate-200 h-11 text-xs font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>{AZURE_VOICES.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={params.style} onValueChange={(v) => setParams(p => ({...p, style: v as AzureStyle}))}>
                    <SelectTrigger className="bg-slate-50 border-slate-200 h-11 text-xs font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>{AZURE_STYLES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-6">
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase"><span>Speed</span><span>{params.rate}x</span></div>
                    <Slider value={[params.rate]} min={0.5} max={1.5} step={0.05} onValueChange={([v]) => setParams(p => ({...p, rate: v}))} />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase"><span>Pitch</span><span>{params.pitch}%</span></div>
                    <Slider value={[params.pitch]} min={-20} max={20} step={1} onValueChange={([v]) => setParams(p => ({...p, pitch: v}))} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="py-10 flex flex-col items-center justify-center space-y-6">
              {status === 'running' && <Loader2 className="h-14 w-14 text-indigo-500 animate-spin" strokeWidth={1.5} />}
              {status === 'completed' && <CheckCircle2 className="h-14 w-14 text-emerald-500" strokeWidth={1.5} />}
              {status === 'error' && <AlertCircle className="h-14 w-14 text-rose-500" strokeWidth={1.5} />}
              <div className="w-full space-y-3 text-center px-4">
                <div className="flex justify-between text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  <span>{status === 'completed' ? 'SUCCESS' : status === 'error' ? 'ERROR' : 'PROCESSING'}</span>
                  <span className="text-slate-900">{progress.current} / {progress.total}</span>
                </div>
                <Progress value={(progress.current / progress.total) * 100} className="h-2.5 bg-slate-100" />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 bg-slate-50 border-t flex gap-2">
          {status === 'idle' && (
            !showConfirm ? (
              <Button onClick={() => setShowConfirm(true)} disabled={filteredTasks.length === 0} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black h-12 shadow-lg gap-2 rounded-full">NEXT STEP <ChevronRight size={18} /></Button>
            ) : (
              <div className="flex gap-2 w-full">
                <Button variant="ghost" onClick={() => setShowConfirm(false)} className="flex-1 font-bold h-12 rounded-full"><ArrowLeft size={16} /> Back</Button>
                <Button onClick={handleBulkGenerate} className="flex-[2] bg-rose-600 hover:bg-rose-700 text-white font-black h-12 shadow-md gap-2 rounded-full"><Zap size={16} fill="currentColor" /> START</Button>
              </div>
            )
          )}
          {status === 'error' && <Button onClick={() => setStatus('idle')} className="w-full bg-slate-800 font-bold h-12 text-white rounded-full">RETRY</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}