'use client';

import { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, Zap, CheckCircle2, AlertCircle, FileAudio, 
  RefreshCw, Volume2, AlertTriangle, ChevronRight, ArrowLeft 
} from 'lucide-react';
import { TTSParameters, usePlayAzureSpeech } from '@gabby/lib/hooks/usePlayAzureSpeech';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useSaveAzureSpeech } from '@/hooks/useSaveAzureSpeech';
import { AZURE_STYLES, AZURE_VOICES, AzureStyle, AzureVoice } from '@gabby/types/azure';
import { buildSSML } from '@gabby/lib/azure/ssml';
import { PhraseRecord, TTSAdjustmentData } from '@gabby/types/word';
import { getPhrasesByContentId } from '@/actions/adminPhraseAction';
import { useWordStore } from '@/stores/useWordStore';

interface TTSBulkDialogProps {
  contentId: string;
  onComplete?: () => void;
  children: React.ReactNode;
}

/**
 * 音声生成のデフォルトパラメータ
 * ダイアログを開くたびにこの値にリセットされます
 */
const DEFAULT_PARAMS: TTSParameters = {
  voice: "en-US-JennyNeural",
  style: "friendly",
  rate: 1.0,
  pitch: 0,
};

// プレビュー（テスト再生）用の固定テキスト
const SAMPLE_TEXT = "This is a sample sentence to check the voice settings.";

export function TTSBulkDialog({ contentId, onComplete, children }: TTSBulkDialogProps) {
  // --- 状態管理 ---
  const [open, setOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false); // 実行直前の確認画面フラグ
  const [showErrorAlert, setShowErrorAlert] = useState(false); // エラー通知用アラート
  const [rawPhrases, setRawPhrases] = useState<PhraseRecord[]>([]); // DBから取得した全フレーズ
  const [targetMode, setTargetMode] = useState<'all' | 'missing'>('all'); // 生成対象のモード
  const [isLoadingData, setIsLoadingData] = useState(false); // データ読み込み中フラグ
  const [params, setParams] = useState<TTSParameters>(DEFAULT_PARAMS); // 現在の音声設定
  const [isProcessing, setIsProcessing] = useState(false); // 一括生成処理中フラグ
  const [progress, setProgress] = useState({ current: 0, total: 0 }); // 進捗状況
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle'); // 処理ステータス
  const [resultCounts, setResultCounts] = useState({ success: 0, error: 0 }); // 最終結果カウント

  // --- カスタムフック ---
  const { save } = useSaveAzureSpeech();
  const { speak, isSpeaking } = usePlayAzureSpeech();
  const { showToast } = useToast();
  const triggerRefresh = useWordStore((state) => state.triggerRefresh); // ストアから取得

  /**
   * 選択されたモード（全件 or 未生成）に基づいて、実際に処理するフレーズを抽出
   */
  const filteredPhrases = useMemo(() => {
    if (targetMode === 'all') return rawPhrases;
    return rawPhrases.filter(p => !p.audio_path);
  }, [rawPhrases, targetMode]);

  /**
   * 最新のフレーズデータを取得
   */
  const fetchPhrases = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const phrases = await getPhrasesByContentId(contentId);
      setRawPhrases(phrases || []);
    } catch (err) {
      showToast("Failed to fetch phrases.", "error");
    } finally {
      setIsLoadingData(false);
    }
  }, [contentId, showToast]);

  /**
   * ダイアログの開閉制御
   * 起動時に必ずパラメータを初期化します
   */
  const handleOpenChange = (isOpen: boolean) => {
    if (isProcessing) return; // 処理中は閉じられないようにする
    setOpen(isOpen);
    
    if (isOpen) {
      // 初期値のリセット
      setParams(DEFAULT_PARAMS);
      setTargetMode('all');
      setShowConfirm(false);
      setStatus('idle');
      setResultCounts({ success: 0, error: 0 });
      fetchPhrases(); // 最新データの取得
    }
  };

  /**
   * テスト再生（プレビュー）の実行
   */
  const handlePreview = async () => {
    await speak(SAMPLE_TEXT, params);
  };

  /**
   * エラーアラートを閉じてリフレッシュを実行するハンドラ
   */
  const handleCloseErrorAlert = () => {
    setShowErrorAlert(false);
    setOpen(false);
    triggerRefresh(); // 成功分だけでも反映させるため追加
    if (onComplete) onComplete(); // 親コンポーネントへ完了を通知（リフレッシュ）
  };

  /**
   * 一括生成処理のメインロジック
   */
  const handleBulkGenerate = async () => {
    setShowConfirm(false);
    setIsProcessing(true);
    setStatus('running');
    
    const total = filteredPhrases.length;
    setProgress({ current: 0, total });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < total; i++) {
      const phrase = filteredPhrases[i];
      setProgress(prev => ({ ...prev, current: i + 1 }));

      try {
        const adjustmentData: TTSAdjustmentData = { settings: params, words: [] };
        const ssml = buildSSML(phrase.phrase_en, adjustmentData);

        // サーバーアクションを通じてAzure TTS生成とStorage保存、DB更新を実行
        const result = await save(
          phrase.phrase_id,
          phrase.word_id,
          ssml,
          'auto',
          adjustmentData,
          phrase.audio_path // 既存パスがあれば上書き用として渡す
        );

        if (result.success) successCount++;
        else errorCount++;
      } catch (err) {
        console.error("Bulk process item error:", err);
        errorCount++;
      }
    }

    setResultCounts({ success: successCount, error: errorCount });
    setIsProcessing(false);

    if (errorCount === 0) {
      setStatus('completed');
      showToast(`Successfully generated ${successCount} audio files.`, "success");
      
      // 正常終了時にクライアント側のリストを最新化
      triggerRefresh();

      setTimeout(() => {
        setOpen(false);
        if (onComplete) onComplete(); // 親コンポーネントへ完了を通知
      }, 1500);
    } else {
      setStatus('error');
      // トーストではなくアラートダイアログを表示
      setShowErrorAlert(true);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="sm:max-w-120 p-0 overflow-hidden border-none shadow-2xl focus:outline-none [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button:focus]:ring-0 [&>button:focus]:outline-none">
          {/* フォーカス奪取用のダミー要素 */}
          <span className="sr-only" tabIndex={0} />
          
          {/* ヘッダーエリア: pt-8 で隙間を調整、-mx-1 -mt-1 で境界を埋める */}
          <DialogHeader className="-mx-1 -mt-1 pt-8 pb-6 px-8 pr-14 bg-slate-900 text-white border-b border-slate-800 rounded-t-none">
            <DialogTitle className="flex items-center gap-2 font-black tracking-tighter text-xl">
              <Zap className="text-amber-400" size={24} fill="currentColor" />
              BULK GENERATOR
            </DialogTitle>
          </DialogHeader>

          <div className="p-8 space-y-8 bg-white">
            {isLoadingData ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading phrases...</p>
              </div>
            ) : status === 'idle' ? (
              <>
                {/* ステップ1: 対象範囲の選択 (シンプルな英語タブ) */}
                <div className="space-y-3">
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Step 1: Scope</Label>
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
                  <div className="flex justify-end pt-1">
                     <span className="text-[10px] font-black text-slate-400 italic">
                      Selected: <span className="text-indigo-600 text-sm">{filteredPhrases.length}</span> / {rawPhrases.length} phrases
                    </span>
                  </div>
                </div>

                {/* ステップ2: 音声設定とプレビュー */}
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

                  {/* ボイス・スタイル選択 */}
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={params.voice} onValueChange={(v) => setParams(p => ({...p, voice: v as AzureVoice}))}>
                      <SelectTrigger className="bg-slate-50 border-slate-200 h-11 text-xs font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AZURE_VOICES.map((v) => <SelectItem key={v.id} value={v.id} className="text-xs">{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>

                    <Select value={params.style} onValueChange={(v) => setParams(p => ({...p, style: v as AzureStyle}))}>
                      <SelectTrigger className="bg-slate-50 border-slate-200 h-11 text-xs font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AZURE_STYLES.map((s) => <SelectItem key={s.id} value={s.id} className="text-xs">{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 詳細調整 (Speed / Pitch) */}
                  <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 space-y-6">
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Speed</span>
                        <span className="text-[11px] font-black text-indigo-600 font-mono tracking-tighter">{params.rate.toFixed(2)}x</span>
                      </div>
                      <Slider value={[params.rate]} min={0.5} max={1.5} step={0.05} onValueChange={([v]) => setParams(p => ({...p, rate: v}))} />
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Pitch</span>
                        <span className="text-[11px] font-black text-indigo-600 font-mono tracking-tighter">
                          {params.pitch > 0 ? `+${params.pitch}` : params.pitch}%
                        </span>
                      </div>
                      <Slider value={[params.pitch]} min={-20} max={20} step={1} onValueChange={([v]) => setParams(p => ({...p, pitch: v}))} />
                    </div>
                    
                    {/* サンプルフレーズ表示 */}
                    <div className="mt-2 p-3 bg-white/80 rounded border border-slate-200/50 italic text-[11px] text-slate-500 text-center shadow-sm">
                      {SAMPLE_TEXT}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* 進捗表示エリア */
              <div className="py-10 flex flex-col items-center justify-center space-y-6">
                {status === 'running' && <Loader2 className="h-14 w-14 text-indigo-500 animate-spin" strokeWidth={1.5} />}
                {status === 'completed' && <CheckCircle2 className="h-14 w-14 text-emerald-500" strokeWidth={1.5} />}
                {status === 'error' && <AlertCircle className="h-14 w-14 text-rose-500" strokeWidth={1.5} />}
                
                <div className="w-full space-y-3 text-center px-4">
                  <div className="flex justify-between text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    <span>{status === 'completed' ? 'SUCCESS' : status === 'error' ? 'ERROR OCCURRED' : 'PROCESSING'}</span>
                    <span className="text-slate-900">{progress.current} / {progress.total}</span>
                  </div>
                  <Progress value={(progress.current / progress.total) * 100} className="h-2.5 bg-slate-100" />
                </div>
              </div>
            )}
          </div>

          {/* フッターエリア */}
          <DialogFooter className="p-4 bg-slate-50 border-t flex gap-2">
            {status === 'idle' && !isLoadingData && (
              <>
                {!showConfirm ? (
                  <Button 
                    onClick={() => setShowConfirm(true)} 
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black h-12 shadow-lg gap-2 rounded-full"
                    disabled={filteredPhrases.length === 0}
                  >
                    NEXT STEP
                    <ChevronRight size={18} />
                  </Button>
                ) : (
                  <div className="flex flex-col w-full gap-4">
                    {/* 警告表示 */}
                    <div className="flex items-start gap-3 text-amber-700 bg-amber-50 p-4 rounded-lg border border-amber-200">
                      <AlertTriangle size={24} className="shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-black uppercase tracking-tight">Final Confirmation</p>
                        <p className="text-[11px] font-medium leading-relaxed opacity-90">
                          This will generate <span className="font-bold underline">{filteredPhrases.length}</span> audio files. 
                          Existing audio will be overwritten.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => setShowConfirm(false)} className="flex-1 font-bold h-11 text-slate-500 gap-1 rounded-full">
                        <ArrowLeft size={16} /> Back
                      </Button>
                      <Button onClick={handleBulkGenerate} className="flex-[2] bg-rose-600 hover:bg-rose-700 text-white font-black h-11 shadow-md gap-2 rounded-full">
                        <Zap size={16} fill="currentColor" />
                        CONFIRM & START
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

      {/* エラー結果通知用アラートダイアログ */}
      <AlertDialog open={showErrorAlert} onOpenChange={setShowErrorAlert}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertCircle size={20} />
              Process Completed with Errors
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-4 space-y-3">
              <p className="font-bold text-slate-900">
                Bulk processing finished, but some errors occurred.
              </p>
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
              <p className="text-xs text-slate-500 leading-relaxed">
                Audio files for successful items have been updated. For failed items, please check your network or SSML syntax and try again.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction 
              onClick={handleCloseErrorAlert}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-8 rounded-full"
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}