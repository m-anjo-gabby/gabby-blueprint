'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Play, Save, Volume2, Sparkles, RotateCcw, Mic2, Check } from 'lucide-react';
import { usePlayAzureSpeech, TTSParameters } from '@gabby/lib/hooks/usePlayAzureSpeech';
import { useToast } from '@gabby/lib/hooks/useToast';
import { AZURE_STYLES, AZURE_VOICES, AzureStyle, AzureVoice } from '@gabby/types/azure';
import { buildSSML } from '@gabby/lib/azure/ssml';
import { saveCVDictionaryAudio, CVDictionaryEntry } from '@/actions/adminCVDictionaryAction';
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

// ============================================================
// Props
// ============================================================

interface CVTTSDialogProps {
  entry: CVDictionaryEntry;
  onUpdate: () => void;
  children: React.ReactNode;
}

// ============================================================
// Component
// ============================================================

export function CVTTSDialog({ entry, onUpdate, children }: CVTTSDialogProps) {
  const [open, setOpen] = useState(false);
  const [params, setParams] = useState<TTSParameters>(DEFAULT_PARAMS);
  const [ssml, setSsml] = useState('');
  const [ssmlMode, setSsmlMode] = useState<'auto' | 'manual'>('auto');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showModeAlert, setShowModeAlert] = useState(false);
  const [showSaveAlert, setShowSaveAlert] = useState(false);

  const { speak, isSpeaking, error, setError } = usePlayAzureSpeech();
  const { showToast } = useToast();
  const triggerRefresh = useCVDictionaryStore((s) => s.triggerRefresh);

  // 読み上げテキスト（word_en を使用）
  const readText = entry.word_en;

  // ----------------------------------------------------------
  // SSML ビルダー
  // ----------------------------------------------------------

  const rebuildSSML = useCallback(
    (currentParams: TTSParameters) => buildSSML(readText, { settings: currentParams, words: [] }),
    [readText]
  );

  useEffect(() => {
    if (ssmlMode === 'auto') {
      setSsml(rebuildSSML(params));
    }
  }, [params, ssmlMode, rebuildSSML]);

  // ----------------------------------------------------------
  // ダイアログ開閉
  // ----------------------------------------------------------

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setParams(DEFAULT_PARAMS);
      setSsmlMode('auto');
      setSsml(rebuildSSML(DEFAULT_PARAMS));
      setError(null);
    }
  };

  // ----------------------------------------------------------
  // モード切替
  // ----------------------------------------------------------

  const handleModeToggle = (checked: boolean) => {
    const nextMode = checked ? 'manual' : 'auto';
    if (nextMode === 'auto') {
      setShowModeAlert(true);
    } else {
      setSsmlMode('manual');
      showToast('Manual edit mode に切り替えました。', 'info');
    }
  };

  const confirmReturnToAuto = () => {
    setSsmlMode('auto');
    setSsml(rebuildSSML(params));
    setShowModeAlert(false);
    showToast('Auto mode に戻しました。', 'success');
  };

  // ----------------------------------------------------------
  // プレビュー再生
  // ----------------------------------------------------------

  const handlePlay = () => {
    if (isSpeaking) return;
    speak(ssml);
  };

  // ----------------------------------------------------------
  // 保存
  // ----------------------------------------------------------

  const handleSave = async () => {
    setIsProcessing(true);
    try {
      const adjustmentData = { settings: params, words: [] };
      const result = await saveCVDictionaryAudio(
        entry.word_en,
        entry.part_of_speech,
        ssml,
        ssmlMode,
        adjustmentData,
        entry.audio_path
      );

      if (result.success) {
        showToast('音声を保存しました。', 'success');
        triggerRefresh();
        onUpdate();
        setOpen(false);
      } else {
        showToast(result.message || '保存に失敗しました。', 'error');
      }
    } catch {
      showToast('システムエラーが発生しました。', 'error');
    } finally {
      setIsProcessing(false);
      setShowSaveAlert(false);
    }
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{children}</DialogTrigger>

        <DialogContent className="max-w-xl p-0 overflow-hidden border-none shadow-2xl focus:outline-none [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button:focus]:ring-0 [&>button:focus]:outline-none max-h-[90vh] flex flex-col">
          <span className="sr-only" tabIndex={0} />

          {/* ヘッダー */}
          <DialogHeader className="-mx-1 -mt-1 pt-6 pb-5 px-8 pr-14 bg-slate-900 text-white border-b border-slate-800 rounded-t-none">
            <DialogTitle className="flex items-center gap-2 font-black tracking-tighter text-xl">
              <Mic2 className="text-indigo-400" size={22} />
              TTS 音声作成
            </DialogTitle>
            <div className="mt-2 p-3 bg-slate-800 rounded-xl border border-slate-700">
              <p className="text-base font-black text-white tracking-tight">{entry.word_en}</p>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                {entry.part_of_speech}
                {entry.phonetic_spelling && ` · ${entry.phonetic_spelling}`}
                {entry.syllables && ` · ${entry.syllables}`}
              </p>
            </div>
          </DialogHeader>

          <div className="p-6 space-y-6 bg-white flex-1 overflow-y-auto">
            {/* ボイス・スタイル */}
            <div className="space-y-3">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Voice Settings</Label>
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
            </div>

            {/* Speed / Pitch */}
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
            </div>

            {/* SSML */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">SSML</Label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400">Manual</span>
                  <Switch
                    checked={ssmlMode === 'manual'}
                    onCheckedChange={handleModeToggle}
                    className="data-[state=checked]:bg-amber-500"
                  />
                </div>
              </div>
              <Textarea
                value={ssml}
                onChange={(e) => { if (ssmlMode === 'manual') setSsml(e.target.value); }}
                readOnly={ssmlMode === 'auto'}
                className="font-mono text-xs min-h-[100px] bg-slate-50 border-slate-200 rounded-xl resize-none"
                placeholder="Auto mode: SSML は自動生成されます"
              />
              {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
            </div>

            {/* リセット */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setParams(DEFAULT_PARAMS); setSsmlMode('auto'); setError(null); }}
              className="text-slate-400 hover:text-slate-600 gap-1.5 text-xs font-bold"
            >
              <RotateCcw size={13} /> Reset Settings
            </Button>
          </div>

          {/* フッター */}
          <DialogFooter className="p-4 bg-slate-50 border-t flex gap-2">
            <Button
              variant="outline"
              onClick={handlePlay}
              disabled={isSpeaking || !ssml}
              className="flex-1 h-11 rounded-xl font-bold border-slate-200 gap-2"
            >
              {isSpeaking ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}
              {isSpeaking ? 'Playing...' : 'プレビュー'}
            </Button>
            <Button
              onClick={() => setShowSaveAlert(true)}
              disabled={isProcessing || !ssml}
              className="flex-[2] h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black gap-2 shadow-lg"
            >
              {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              音声を保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* モード切替確認 */}
      <AlertDialog open={showModeAlert} onOpenChange={setShowModeAlert}>
        <AlertDialogContent className="rounded-3xl border-none p-8 max-w-[400px]">
          <AlertDialogHeader className="space-y-4">
            <div className="text-center space-y-2">
              <AlertDialogTitle className="text-xl font-black text-slate-800">Manual → Auto に戻しますか？</AlertDialogTitle>
              <AlertDialogDescription className="text-xs font-medium text-slate-500">
                手動編集した SSML が破棄され、現在の設定から再生成されます。
              </AlertDialogDescription>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-3 mt-4">
            <AlertDialogCancel className="flex-1 h-12 rounded-2xl border-none bg-slate-100 font-bold text-slate-500">キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReturnToAuto} className="flex-1 h-12 rounded-2xl bg-slate-900 text-white font-bold">
              Auto に戻す
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 保存確認 */}
      <AlertDialog open={showSaveAlert} onOpenChange={setShowSaveAlert}>
        <AlertDialogContent className="rounded-3xl border-none p-8 max-w-[400px]">
          <AlertDialogHeader className="space-y-4">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto">
              <Sparkles size={28} />
            </div>
            <div className="text-center space-y-2">
              <AlertDialogTitle className="text-xl font-black text-slate-800">音声を生成・保存しますか？</AlertDialogTitle>
              <AlertDialogDescription className="text-xs font-medium text-slate-500">
                「{entry.word_en}」（{entry.part_of_speech}）の音声を生成します。<br />
                既存の音声がある場合は上書きされます。
              </AlertDialogDescription>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-3 mt-4">
            <AlertDialogCancel className="flex-1 h-12 rounded-2xl border-none bg-slate-100 font-bold text-slate-500">キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave} disabled={isProcessing} className="flex-1 h-12 rounded-2xl bg-indigo-600 text-white font-bold">
              {isProcessing ? <><Loader2 size={16} className="animate-spin mr-2" />生成中...</> : <><Check size={16} className="mr-2" />生成する</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
