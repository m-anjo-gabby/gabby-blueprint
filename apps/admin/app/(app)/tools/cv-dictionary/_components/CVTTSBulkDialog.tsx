'use client';

import { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, Zap, CheckCircle2, AlertCircle, FileAudio,
  RefreshCw, Volume2, AlertTriangle, ChevronRight, ArrowLeft,
} from 'lucide-react';
import { TTSParameters, usePlayAzureSpeech } from '@gabby/lib/hooks/usePlayAzureSpeech';
import { useToast } from '@gabby/lib/hooks/useToast';
import { AZURE_STYLES, AZURE_VOICES, AzureStyle, AzureVoice } from '@gabby/types/azure';
import { buildSSML } from '@gabby/lib/azure/ssml';
import { getAllCVDictionaryEntries, saveCVDictionaryAudio, CVDictionaryEntry } from '@/actions/adminCVDictionaryAction';
import { useCVDictionaryStore } from '@/stores/useCVDictionaryStore';

// ============================================================
// 定数
// ============================================================

const DEFAULT_PARAMS: TTSParameters = {
  voice: 'en-US-JennyNeural',
  style: 'friendly',
  rate: 1.0,
  pitch: 0,
};

const SAMPLE_TEXT = 'This is a sample sentence to check the voice settings.';

// ============================================================
// Props
// ============================================================

interface CVTTSBulkDialogProps {
  onComplete?: () => void;
  children: React.ReactNode;
}

// ============================================================
// Component
// ============================================================

export function CVTTSBulkDialog({ onComplete, children }: CVTTSBulkDialogProps) {
  const [open, setOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showErrorAlert, setShowErrorAlert] = useState(false);
  const [rawEntries, setRawEntries] = useState<CVDictionaryEntry[]>([]);
  const [targetMode, setTargetMode] = useState<'all' | 'missing'>('all');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [params, setParams] = useState<TTSParameters>(DEFAULT_PARAMS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [resultCounts, setResultCounts] = useState({ success: 0, error: 0 });

  const { speak, isSpeaking } = usePlayAzureSpeech();
  const { showToast } = useToast();
  const triggerRefresh = useCVDictionaryStore((s) => s.triggerRefresh);

  // ----------------------------------------------------------
  // 対象エントリの絞り込み
  // ----------------------------------------------------------

  const filteredEntries = useMemo(() => {
    if (targetMode === 'all') return rawEntries;
    return rawEntries.filter((e) => !e.audio_path);
  }, [rawEntries, targetMode]);

  // ----------------------------------------------------------
  // データ取得
  // ----------------------------------------------------------

  const fetchEntries = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const entries = await getAllCVDictionaryEntries();
      setRawEntries(entries ?? []);
    } catch {
      showToast('データの取得に失敗しました。', 'error');
    } finally {
      setIsLoadingData(false);
    }
  }, [showToast]);

  // ----------------------------------------------------------
  // ダイアログ開閉
  // ----------------------------------------------------------

  const handleOpenChange = (isOpen: boolean) => {
    if (isProcessing) return;
    setOpen(isOpen);
    if (isOpen) {
      setParams(DEFAULT_PARAMS);
      setTargetMode('all');
      setShowConfirm(false);
      setStatus('idle');
      setResultCounts({ success: 0, error: 0 });
      fetchEntries();
    }
  };

  // ----------------------------------------------------------
  // プレビュー
  // ----------------------------------------------------------

  const handlePreview = () => {
    const ssml = buildSSML(SAMPLE_TEXT, { settings: params, words: [] });
    speak(ssml);
  };

  // ----------------------------------------------------------
  // エラーアラートを閉じる
  // ----------------------------------------------------------

  const handleCloseErrorAlert = () => {
    setShowErrorAlert(false);
    setOpen(false);
    triggerRefresh();
    onComplete?.();
  };

  // ----------------------------------------------------------
  // 一括生成
  // ----------------------------------------------------------

  const handleBulkGenerate = async () => {
    setShowConfirm(false);
    setIsProcessing(true);
    setStatus('running');

    const total = filteredEntries.length;
    setProgress({ current: 0, total });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < total; i++) {
      const entry = filteredEntries[i];
      setProgress((prev) => ({ ...prev, current: i + 1 }));

      try {
        const adjustmentData = { settings: params, words: [] };
        const ssml = buildSSML(entry.word_en, adjustmentData);

        const result = await saveCVDictionaryAudio(
          entry.word_en,
          entry.part_of_speech,
          ssml,
          'auto',
          adjustmentData,
          entry.audio_path
        );

        if (result.success) successCount++;
        else errorCount++;
      } catch {
        errorCount++;
      }
    }

    setResultCounts({ success: successCount, error: errorCount });
    setIsProcessing(false);

    if (errorCount === 0) {
      setStatus('completed');
      showToast(`${successCount}件の音声を生成しました。`, 'success');
      triggerRefresh();
      setTimeout(() => {
        setOpen(false);
        onComplete?.();
      }, 1500);
    } else {
      setStatus('error');
      setShowErrorAlert(true);
    }
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{children}</DialogTrigger>

        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-none shadow-2xl focus:outline-none [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button:focus]:ring-0 [&>button:focus]:outline-none max-h-[90vh] flex flex-col">
          <span className="sr-only" tabIndex={0} />

          {/* ヘッダー */}
          <DialogHeader className="-mx-1 -mt-1 pt-8 pb-6 px-8 pr-14 bg-slate-900 text-white border-b border-slate-800 rounded-t-none">
            <DialogTitle className="flex items-center gap-2 font-black tracking-tighter text-xl">
              <Zap className="text-amber-400" size={24} fill="currentColor" />
              BULK AUDIO GENERATOR
            </DialogTitle>
            <p className="text-xs text-slate-400 mt-1 font-medium">CV辞書 全エントリの一括音声生成</p>
          </DialogHeader>

          <div className="p-8 space-y-8 bg-white flex-1 overflow-y-auto">
            {isLoadingData ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading entries...</p>
              </div>
            ) : status === 'idle' ? (
              <>
                {/* Step 1: 対象範囲 */}
                <div className="space-y-3">
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Step 1: Scope</Label>
                  <Tabs value={targetMode} onValueChange={(v) => setTargetMode(v as 'all' | 'missing')} className="w-full">
                    <TabsList className="grid grid-cols-2 w-full bg-slate-100 p-1 h-11 border border-slate-200">
                      <TabsTrigger value="all" className="font-bold gap-2 text-xs">
                        <RefreshCw size={14} /> Re-generate All
                      </TabsTrigger>
                      <TabsTrigger value="missing" className="font-bold gap-2 text-xs">
                        <FileAudio size={14} /> Missing Only
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="flex justify-end pt-1">
                    <span className="text-[10px] font-black text-slate-400 italic">
                      Selected: <span className="text-indigo-600 text-sm">{filteredEntries.length}</span> / {rawEntries.length} entries
                    </span>
                  </div>
                </div>

                {/* Step 2: 音声設定 */}
                <div className="space-y-5 pt-6 border-t border-dashed border-slate-200">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Step 2: Settings</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePreview}
                      disabled={isSpeaking}
                      className="h-8 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 gap-1.5 px-3 rounded-full border border-indigo-100"
                    >
                      {isSpeaking ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}
                      TEST PREVIEW
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Select value={params.voice} onValueChange={(v) => setParams((p) => ({ ...p, voice: v as AzureVoice }))}>
                      <SelectTrigger className="bg-slate-50 border-slate-200 h-11 text-xs font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AZURE_VOICES.map((v) => <SelectItem key={v.id} value={v.id} className="text-xs">{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={params.style} onValueChange={(v) => setParams((p) => ({ ...p, style: v as AzureStyle }))}>
                      <SelectTrigger className="bg-slate-50 border-slate-200 h-11 text-xs font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AZURE_STYLES.map((s) => <SelectItem key={s.id} value={s.id} className="text-xs">{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 space-y-5">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Speed</span>
                        <span className="text-[11px] font-black text-indigo-600 font-mono">{params.rate.toFixed(2)}x</span>
                      </div>
                      <Slider value={[params.rate]} min={0.5} max={1.5} step={0.05} onValueChange={([v]) => setParams((p) => ({ ...p, rate: v }))} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Pitch</span>
                        <span className="text-[11px] font-black text-indigo-600 font-mono">{params.pitch > 0 ? `+${params.pitch}` : params.pitch}%</span>
                      </div>
                      <Slider value={[params.pitch]} min={-20} max={20} step={1} onValueChange={([v]) => setParams((p) => ({ ...p, pitch: v }))} />
                    </div>
                    <div className="p-3 bg-white/80 rounded border border-slate-200/50 italic text-[11px] text-slate-500 text-center shadow-sm">
                      {SAMPLE_TEXT}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* 進捗表示 */
              <div className="py-10 flex flex-col items-center justify-center space-y-6">
                {status === 'running' && <Loader2 className="h-14 w-14 text-indigo-500 animate-spin" strokeWidth={1.5} />}
                {status === 'completed' && <CheckCircle2 className="h-14 w-14 text-emerald-500" strokeWidth={1.5} />}
                {status === 'error' && <AlertCircle className="h-14 w-14 text-rose-500" strokeWidth={1.5} />}

                <div className="w-full space-y-3 text-center px-4">
                  <div className="flex justify-between text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    <span>{status === 'completed' ? 'SUCCESS' : status === 'error' ? 'ERROR' : 'PROCESSING'}</span>
                    <span className="text-slate-900">{progress.current} / {progress.total}</span>
                  </div>
                  <Progress value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} className="h-2.5 bg-slate-100" />
                </div>
              </div>
            )}
          </div>

          {/* フッター */}
          <DialogFooter className="p-4 bg-slate-50 border-t flex gap-2">
            {status === 'idle' && !isLoadingData && (
              <>
                {!showConfirm ? (
                  <Button
                    onClick={() => setShowConfirm(true)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black h-12 shadow-lg gap-2 rounded-full"
                    disabled={filteredEntries.length === 0}
                  >
                    NEXT STEP <ChevronRight size={18} />
                  </Button>
                ) : (
                  <div className="flex flex-col w-full gap-4">
                    <div className="flex items-start gap-3 text-amber-700 bg-amber-50 p-4 rounded-lg border border-amber-200">
                      <AlertTriangle size={24} className="shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-black uppercase tracking-tight">Final Confirmation</p>
                        <p className="text-[11px] font-medium leading-relaxed opacity-90">
                          <span className="font-bold underline">{filteredEntries.length}</span> 件の音声ファイルを生成します。既存の音声は上書きされます。
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => setShowConfirm(false)} className="flex-1 font-bold h-11 text-slate-500 gap-1 rounded-full">
                        <ArrowLeft size={16} /> Back
                      </Button>
                      <Button onClick={handleBulkGenerate} className="flex-[2] bg-rose-600 hover:bg-rose-700 text-white font-black h-11 shadow-md gap-2 rounded-full">
                        <Zap size={16} fill="currentColor" /> CONFIRM & START
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
            {status === 'error' && (
              <Button onClick={() => setStatus('idle')} className="w-full bg-slate-800 font-bold h-12 text-white rounded-full">
                RETRY SETTINGS
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* エラー結果アラート */}
      <AlertDialog open={showErrorAlert} onOpenChange={setShowErrorAlert}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertCircle size={20} /> 処理完了（エラーあり）
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-4 space-y-3">
              <p className="font-bold text-slate-900">一括生成が完了しましたが、一部にエラーがありました。</p>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Success</p>
                  <p className="text-2xl font-black text-emerald-600">{resultCounts.success}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Error</p>
                  <p className="text-2xl font-black text-rose-600">{resultCounts.error}</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleCloseErrorAlert} className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-8 rounded-full">
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
