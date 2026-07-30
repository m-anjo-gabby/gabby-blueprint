'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Loader2, Play, Save, Volume2, Sparkles, RotateCcw, PlusCircle, Mic2, XCircle, PencilLine, Check, Copy } from 'lucide-react';
import { TTSAdjustmentData, WordAdjustment } from '@gabby/types/word';
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
  const [ssml, setSsml] = useState(entry.tts_ssml || '');
  const [ssmlMode, setSsmlMode] = useState<'auto' | 'manual'>(entry.tts_ssml_mode || 'auto');
  const [adjustments, setAdjustments] = useState<WordAdjustment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showModeAlert, setShowModeAlert] = useState(false);
  const [showSaveAlert, setShowSaveAlert] = useState(false);
  const [copied, setCopied] = useState(false);

  const { speak, generateSSML, isSpeaking, error, setError } = usePlayAzureSpeech();
  const { showToast } = useToast();
  const triggerRefresh = useCVDictionaryStore((s) => s.triggerRefresh);

  const readText = entry.word_en || '';

  // 単語配列の初期化
  useEffect(() => {
    const words: WordAdjustment[] = readText.split(' ').filter(Boolean).map((word, i) => ({
      id: `word-${i}`,
      fullText: word,
      text: word.replace(/[.,!?;:]/g, ''),
      emphasis: false,
      emphasisLevel: 'moderate',
      breakAfter: false,
      breakDuration: 300,
      ipa: '',
    }));
    setAdjustments(words);
  }, [readText]);

  // 初期状態でのプレーン再生
  const playOriginal = () => {
    if (isSpeaking || !readText) return;
    const originalSsml = generateSSML(readText, DEFAULT_PARAMS);
    speak(originalSsml);
  };

  // SSML再構築ロジック
  const rebuildSSML = useCallback(
    (currentParams: TTSParameters, currentAdjs: WordAdjustment[]) => {
      return buildSSML(readText, {
        settings: currentParams,
        words: currentAdjs,
      });
    },
    [readText]
  );

  // Autoモード時のみ、設定変更をSSMLに反映
  useEffect(() => {
    if (ssmlMode === 'auto') {
      const newSsml = rebuildSSML(params, adjustments);
      setSsml(newSsml);
    }
  }, [params, adjustments, ssmlMode, rebuildSSML]);

  const updateAdjustment = (id: string, updates: Partial<WordAdjustment>) => {
    if (ssmlMode === 'manual') return;
    setAdjustments((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  };

  // モード切替時のハンドラ
  const handleModeToggle = (checked: boolean) => {
    const nextMode = checked ? 'manual' : 'auto';
    if (nextMode === 'auto') {
      setShowModeAlert(true);
    } else {
      setSsmlMode('manual');
      showToast('Switched to manual edit mode.', 'info');
    }
  };

  // 手動編集を破棄してAutoに戻す
  const confirmReturnToAuto = () => {
    setSsmlMode('auto');
    const resetSsml = rebuildSSML(params, adjustments);
    setSsml(resetSsml);
    setShowModeAlert(false);
    showToast('Switched to auto mode. Settings synced.', 'success');
  };

  const handleReset = () => {
    if (error) setError(null);
    setParams(DEFAULT_PARAMS);
    setAdjustments((prev) =>
      prev.map((a) => ({
        ...a,
        emphasis: false,
        emphasisLevel: 'moderate',
        breakAfter: false,
        breakDuration: 300,
        ipa: '',
      }))
    );
    setSsmlMode('auto');
    showToast('All settings have been reset.', 'info');
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(ssml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 保存処理
  const handleSave = async () => {
    setIsProcessing(true);
    try {
      const adjustmentData: TTSAdjustmentData = {
        settings: {
          voice: params.voice,
          style: params.style,
          rate: params.rate,
          pitch: params.pitch,
        },
        words: adjustments,
      };

      const result = await saveCVDictionaryAudio(
        entry.word_en,
        entry.part_of_speech,
        ssml,
        ssmlMode,
        adjustmentData,
        entry.audio_path
      );

      if (result.success) {
        showToast('Audio saved successfully.', 'success');
        triggerRefresh();
        onUpdate();
        setOpen(false);
      } else {
        showToast(result.message || 'Failed to save audio.', 'error');
      }
    } catch {
      showToast('An error occurred.', 'error');
    } finally {
      setIsProcessing(false);
      setShowSaveAlert(false);
    }
  };

  // ダイアログ開閉時の状態復元
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);

    if (isOpen) {
      setError(null);
      setCopied(false);

      const mode = entry.tts_ssml_mode || 'auto';
      setSsmlMode(mode);
      setSsml(entry.tts_ssml || '');

      const currentWordsBase: WordAdjustment[] = readText
        .split(' ')
        .filter(Boolean)
        .map((word, i) => ({
          id: `word-${i}`,
          fullText: word,
          text: word.replace(/[.,!?;:]/g, ''),
          emphasis: false,
          emphasisLevel: 'moderate' as const,
          breakAfter: false,
          breakDuration: 300,
          ipa: '',
        }));

      if (entry.tts_adjustments) {
        const data = entry.tts_adjustments as unknown as TTSAdjustmentData;

        if (data.settings) {
          setParams({
            voice: (data.settings.voice as AzureVoice) || DEFAULT_PARAMS.voice,
            style: (data.settings.style as AzureStyle) || DEFAULT_PARAMS.style,
            rate: data.settings.rate ?? DEFAULT_PARAMS.rate,
            pitch: data.settings.pitch ?? DEFAULT_PARAMS.pitch,
          });
        }

        if (data.words && data.words.length > 0) {
          const mergedWords = currentWordsBase.map((base, i) => {
            const saved = data.words[i];
            return saved && saved.text === base.text ? { ...base, ...saved } : base;
          });
          setAdjustments(mergedWords);
        } else {
          setAdjustments(currentWordsBase);
        }
      } else {
        setParams(DEFAULT_PARAMS);
        setAdjustments(currentWordsBase);
      }
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="max-w-5xl p-0 overflow-hidden border-none shadow-2xl focus:outline-none [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button:focus]:ring-0 [&>button:focus]:outline-none">
          {/* フォーカス奪取防止用の隠し要素 */}
          <span className="sr-only" tabIndex={0} />

          {/* ヘッダー */}
          <DialogHeader className="-mx-1 -mt-1 pt-8 pb-6 px-8 pr-14 bg-slate-900 text-white rounded-t-none border-b border-slate-800">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <DialogTitle className="flex items-center gap-2 font-black text-xl">
                  <Volume2 className="text-indigo-400" size={24} />
                  Azure TTS Voice Designer
                </DialogTitle>
                <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                  <span className="font-bold text-white text-sm">{entry.word_en}</span>
                  <span>·</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">{entry.part_of_speech}</span>
                  {entry.phonetic_spelling && (
                    <>
                      <span>·</span>
                      <span className="font-mono text-slate-300">{entry.phonetic_spelling}</span>
                    </>
                  )}
                  {entry.syllables && (
                    <>
                      <span>·</span>
                      <span className="text-slate-400">{entry.syllables}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* 原文表示セクション：Manual時は操作不可 */}
          <div className={`px-8 py-6 bg-indigo-50/30 border-b border-indigo-100/50 transition-all duration-300 ${ssmlMode === 'manual' ? 'opacity-40 grayscale pointer-events-none' : 'opacity-100'}`}>
            <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-x-2 gap-y-3">
              {adjustments.map((adj) => (
                <Popover key={adj.id}>
                  <PopoverTrigger asChild>
                    <span
                      className={`text-xl font-bold leading-snug tracking-tight cursor-pointer px-1 rounded transition-all border-b-2 
                        ${
                          adj.emphasis || adj.ipa || adj.breakAfter
                            ? 'text-indigo-600 bg-indigo-100 border-indigo-500'
                            : 'text-slate-800 border-transparent hover:bg-slate-100'
                        }`}
                    >
                      {adj.fullText}
                    </span>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-4 shadow-xl border-slate-200" align="center">
                    <div className="space-y-5">
                      <div className="flex items-center justify-between border-b pb-2">
                        <span className="text-sm font-black text-slate-700">{adj.text}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-slate-400 hover:text-rose-500"
                          onClick={() => updateAdjustment(adj.id, { emphasis: false, breakAfter: false, ipa: '' })}
                        >
                          <RotateCcw size={12} />
                        </Button>
                      </div>

                      {/* 強調設定 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                            <Sparkles size={12} className={adj.emphasis ? 'text-amber-500' : ''} /> Emphasis
                          </Label>
                          <Button
                            variant={adj.emphasis ? 'default' : 'outline'}
                            size="sm"
                            className="h-6 px-2 text-[9px]"
                            onClick={() => updateAdjustment(adj.id, { emphasis: !adj.emphasis })}
                          >
                            {adj.emphasis ? 'ON' : 'OFF'}
                          </Button>
                        </div>
                        {adj.emphasis && (
                          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-md">
                            {(['reduced', 'moderate', 'strong'] as const).map((level) => (
                              <button
                                key={level}
                                onClick={() => updateAdjustment(adj.id, { emphasisLevel: level })}
                                className={`text-[9px] py-1 rounded transition-all ${
                                  adj.emphasisLevel === level
                                    ? 'bg-white shadow-sm font-bold text-indigo-600'
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                              >
                                {level}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* ポーズ設定 */}
                      <div className="space-y-2 border-t pt-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                            <PlusCircle size={12} className={adj.breakAfter ? 'text-indigo-500' : ''} /> Pause After
                          </Label>
                          <Button
                            variant={adj.breakAfter ? 'default' : 'outline'}
                            size="sm"
                            className="h-6 px-2 text-[9px]"
                            onClick={() => updateAdjustment(adj.id, { breakAfter: !adj.breakAfter })}
                          >
                            {adj.breakAfter ? 'ON' : 'OFF'}
                          </Button>
                        </div>
                        {adj.breakAfter && (
                          <div className="space-y-2 px-1">
                            <div className="flex justify-between text-[9px] text-indigo-600 font-mono">
                              <span>Duration:</span>
                              <span>{adj.breakDuration}ms</span>
                            </div>
                            <Slider
                              value={[adj.breakDuration]}
                              min={50}
                              max={1000}
                              step={50}
                              onValueChange={([v]) => updateAdjustment(adj.id, { breakDuration: v })}
                            />
                          </div>
                        )}
                      </div>

                      {/* IPA設定 */}
                      <div className="space-y-1.5 pt-3 border-t">
                        <Label className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1 italic">
                          <Mic2 size={10} /> IPA Pronunciation
                        </Label>
                        <Input
                          value={adj.ipa}
                          onChange={(e) => updateAdjustment(adj.id, { ipa: e.target.value })}
                          className="h-7 text-xs font-mono bg-slate-50"
                          placeholder="ex: æpl"
                        />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              ))}
            </div>
          </div>

          {/* 2カラムレイアウト */}
          <div className="grid grid-cols-1 md:grid-cols-2 bg-white">
            {/* 左：コントロールパネル */}
            <div className={`p-8 space-y-8 border-r border-slate-100 transition-opacity ${ssmlMode === 'manual' ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
              <div className="space-y-4">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Voice Settings</Label>

                {/* Voice Select */}
                <Select value={params.voice} onValueChange={(v) => setParams((p) => ({ ...p, voice: v as AzureVoice }))}>
                  <SelectTrigger className="w-full bg-slate-50 border-slate-200 font-medium">
                    <SelectValue placeholder="Select Voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {AZURE_VOICES.map((voice) => (
                      <SelectItem key={voice.id} value={voice.id}>
                        {voice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Style Select */}
                <Select value={params.style} onValueChange={(v) => setParams((p) => ({ ...p, style: v as AzureStyle }))}>
                  <SelectTrigger className="w-full bg-slate-50 border-slate-200 font-medium">
                    <SelectValue placeholder="Select Style" />
                  </SelectTrigger>
                  <SelectContent>
                    {AZURE_STYLES.map((style) => (
                      <SelectItem key={style.id} value={style.id}>
                        {style.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Speed: {params.rate}x</Label>
                  <Slider value={[params.rate]} min={0.5} max={1.5} step={0.05} onValueChange={([v]) => setParams((p) => ({ ...p, rate: v }))} />
                </div>
                <div className="space-y-3">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pitch: {params.pitch}%</Label>
                  <Slider value={[params.pitch]} min={-20} max={20} step={1} onValueChange={([v]) => setParams((p) => ({ ...p, pitch: v }))} />
                </div>
              </div>
            </div>

            {/* 右：SSMLエディタセクション */}
            <div className="p-8 bg-slate-50 space-y-0 flex flex-col h-full">
              <div className="flex justify-between items-center mb-3 px-1">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  SSML Code <Sparkles size={10} className="text-indigo-500" />
                </Label>
                <Button variant="ghost" size="sm" onClick={handleReset} className="h-6 text-[10px] gap-1 text-slate-400 hover:text-rose-500 transition-colors">
                  <RotateCcw size={10} /> Reset
                </Button>
              </div>

              <div className="flex flex-col flex-grow border border-slate-200 rounded-xl overflow-hidden shadow-inner bg-slate-900">
                <Textarea
                  value={ssml}
                  readOnly={ssmlMode === 'auto'}
                  onChange={(e) => {
                    setSsml(e.target.value);
                    if (error) setError(null);
                  }}
                  className={`flex-grow font-mono text-[11px] leading-relaxed text-emerald-400 border-none rounded-none p-5 focus-visible:ring-0 resize-none ${
                    ssmlMode === 'auto' ? 'bg-slate-900/50 opacity-90' : 'bg-slate-900'
                  }`}
                  placeholder="Enter SSML code here..."
                />

                <div className={`flex items-center justify-between px-3 py-2 border-t transition-colors ${ssmlMode === 'manual' ? 'bg-rose-950/30 border-rose-900/30' : 'bg-slate-800 border-slate-700'}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-black/20 p-1 rounded-md">
                      <button
                        onClick={() => ssmlMode === 'manual' && handleModeToggle(false)}
                        className={`text-[8px] font-black px-2 py-0.5 rounded transition-all ${
                          ssmlMode === 'auto' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-400'
                        }`}
                      >
                        AUTO
                      </button>
                      <Switch
                        checked={ssmlMode === 'manual'}
                        onCheckedChange={handleModeToggle}
                        className="data-[state=checked]:bg-rose-500 scale-75"
                      />
                      <button
                        onClick={() => ssmlMode === 'auto' && handleModeToggle(true)}
                        className={`text-[8px] font-black px-2 py-0.5 rounded transition-all ${
                          ssmlMode === 'manual' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-400'
                        }`}
                      >
                        MANUAL
                      </button>
                    </div>
                    {ssmlMode === 'manual' && (
                      <span className="text-[9px] font-bold text-rose-400 flex items-center gap-1 animate-pulse">
                        <PencilLine size={10} /> MANUAL EDITING
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-3 text-[9px] font-bold text-slate-400 hover:text-white hover:bg-slate-700 gap-1.5 transition-all"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <>
                          <Check size={10} className="text-emerald-400" /> COPIED!
                        </>
                      ) : (
                        <>
                          <Copy size={10} /> COPY SSML
                        </>
                      )}
                    </Button>
                    <div className="text-[8px] font-mono text-slate-500 px-2 uppercase tracking-tighter border-l border-slate-700 ml-1">
                      {ssml.length} chars
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-3 p-3 bg-rose-50 border border-rose-100 rounded-lg flex items-start gap-2 animate-in slide-in-from-top-1">
                  <XCircle size={14} className="text-rose-500 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-rose-700">SSML Syntax Error</p>
                    <p className="text-[9px] text-rose-600 leading-tight font-mono">{error}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* フッター */}
          <DialogFooter className="p-4 bg-white border-t border-slate-100 flex items-center justify-end gap-3 sm:justify-end">
            <Button
              variant="ghost"
              className="px-4 text-slate-400 font-bold h-12 rounded-full gap-2 hover:bg-slate-50 transition-all border border-transparent hover:border-slate-200"
              onClick={playOriginal}
              disabled={isSpeaking || isProcessing}
            >
              <Volume2 size={16} />
              ORIGINAL
            </Button>

            <Button
              variant="outline"
              className="px-8 border-2 border-indigo-100 text-indigo-600 font-bold h-12 rounded-full gap-2 hover:bg-indigo-50 transition-all"
              onClick={() => {
                if (isSpeaking) return;
                speak(ssml);
              }}
              disabled={isSpeaking || isProcessing}
            >
              {isSpeaking ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
              LISTEN
            </Button>

            <Button
              className={`px-12 font-black h-12 rounded-full shadow-lg gap-2 text-white transition-all ${
                ssmlMode === 'manual' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
              onClick={() => setShowSaveAlert(true)}
              disabled={isProcessing || isSpeaking}
            >
              {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              SAVE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* モード戻し確認ダイアログ */}
      <AlertDialog open={showModeAlert} onOpenChange={setShowModeAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to Auto Mode?</AlertDialogTitle>
            <AlertDialogDescription>
              Your manual edits will be discarded, and the SSML will be reset based on the current UI settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowModeAlert(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReturnToAuto} className="bg-indigo-600 hover:bg-indigo-700">
              Reset and Switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 保存確認ダイアログ（Auto/Manual共通） */}
      <AlertDialog open={showSaveAlert} onOpenChange={setShowSaveAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Audio?</AlertDialogTitle>
            <AlertDialogDescription>
              {ssmlMode === 'manual'
                ? 'The audio will be generated and saved using your manually edited SSML code.'
                : 'The audio will be generated and saved using the current parameter settings.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowSaveAlert(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSave}
              className={ssmlMode === 'manual' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}
            >
              Confirm Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
