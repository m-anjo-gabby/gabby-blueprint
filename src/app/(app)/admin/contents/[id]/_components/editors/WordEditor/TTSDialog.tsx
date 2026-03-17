'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Loader2, Play, Save, Volume2, Sparkles, RotateCcw, PlusCircle, Mic2, XCircle, PencilLine, Check, Copy } from 'lucide-react';
import { PhraseRecord, WordAdjustment } from '@/types/word';
import { generateAndSaveTTS } from '@/actions/adminTTSAction';
import { useAzureSpeech, TTSParameters } from '@/hooks/useAzureSpeech';
import { useToast } from '@/hooks/useToast';

interface TTSDialogProps {
  phrase: PhraseRecord;
  onUpdate: () => void;
  children: React.ReactNode;
}

// コントロールエリア初期パラメータ
const DEFAULT_PARAMS: TTSParameters = {
  voice: "en-US-JennyNeural",
  style: "friendly",
  rate: 1.0,
  pitch: 0,
};

export function TTSDialog({ phrase, onUpdate, children }: TTSDialogProps) {
  const [open, setOpen] = useState(false);
  const [params, setParams] = useState<TTSParameters>(DEFAULT_PARAMS);
  const [ssml, setSsml] = useState(phrase.tts_ssml || '');
  const [ssmlMode, setSsmlMode] = useState<'auto' | 'manual'>(phrase.tts_ssml_mode || 'auto');
  const [adjustments, setAdjustments] = useState<WordAdjustment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showModeAlert, setShowModeAlert] = useState(false);
  const [showSaveAlert, setShowSaveAlert] = useState(false); // 保存確認用
  const [copied, setCopied] = useState(false);

  const { speak, generateSSML, isSpeaking, error, setError } = useAzureSpeech();
  const { showToast } = useToast();

  // 単語配列の初期化
  useEffect(() => {
    const words: WordAdjustment[] = phrase.phrase_en.split(' ').map((word, i) => ({
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
  }, [phrase.phrase_en]);

  // SSML再構築ロジック
  const rebuildSSML = useCallback((currentParams: TTSParameters, currentAdjs: WordAdjustment[]) => {
    const processedText = currentAdjs.map(adj => {
      let segment = adj.fullText;
      if (adj.ipa.trim()) {
        const punctuation = adj.fullText.slice(adj.text.length);
        segment = `<phoneme alphabet="ipa" ph="${adj.ipa.trim()}">${adj.text}</phoneme>${punctuation}`;
      }
      if (adj.emphasis) {
        segment = `<emphasis level="${adj.emphasisLevel}">${segment}</emphasis>`;
      }
      if (adj.breakAfter) {
        segment = `${segment}<break time="${adj.breakDuration}ms"/>`;
      }
      return segment;
    }).join(' ');

    return generateSSML(processedText, currentParams);
  }, [generateSSML]);

  // Autoモード時のみ、設定変更をSSMLに反映
  useEffect(() => {
    if (ssmlMode === 'auto') {
      const newSsml = rebuildSSML(params, adjustments);
      setSsml(newSsml);
    }
  }, [params, adjustments, ssmlMode, rebuildSSML]);

  const updateAdjustment = (id: string, updates: Partial<WordAdjustment>) => {
    if (ssmlMode === 'manual') return; // 手動モード時はガード
    setAdjustments(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  // モード切替時のハンドラ
  const handleModeToggle = (checked: boolean) => {
    const nextMode = checked ? 'manual' : 'auto';
    if (nextMode === 'auto') {
      // Manual -> Auto に戻す場合は警告を出す
      setShowModeAlert(true);
    } else {
      // Auto -> Manual はそのまま移行
      setSsmlMode('manual');
      showToast("Switched to manual edit mode.", "info");
    }
  };

  // 手動編集を破棄してAutoに戻す
  const confirmReturnToAuto = () => {
    setSsmlMode('auto');
    const resetSsml = rebuildSSML(params, adjustments);
    setSsml(resetSsml);
    setShowModeAlert(false);
    showToast("Switched to auto mode. Settings synced.", "success");
  };

  const handleReset = () => {
    if (error) setError(null);
    setParams(DEFAULT_PARAMS);
    setAdjustments(prev => prev.map(a => ({ 
      ...a, 
      emphasis: false, 
      emphasisLevel: 'moderate',
      breakAfter: false, 
      breakDuration: 300,
      ipa: '' 
    })));
    setSsmlMode('auto');
    showToast("All settings have been reset.", "info");
  };

  const handleSave = async () => {
    setIsProcessing(true);
    try {
      // phrase_id, ssml に加え、現在のモードも保存
      const result = await generateAndSaveTTS(phrase.phrase_id, ssml, ssmlMode, adjustments);
      if (result.success) {
        showToast("Audio saved successfully.", "success");
        onUpdate();
        setOpen(false);
      } else {
        showToast(result.message || "Failed to save audio.", "error");
      }
    } catch (e) {
      showToast("An error occurred.", "error");
    } finally {
      setIsProcessing(false);
      setShowSaveAlert(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(ssml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000); // 2秒後にアイコンを戻す
  };

  // --- 初期化・復元ロジック ---
  const initializeDialog = useCallback(() => {
    // 1. 基本パラメータのリセット
    setParams(DEFAULT_PARAMS);
    setError(null);
    setCopied(false);

    // 2. モードの同期
    const mode = phrase.tts_ssml_mode || 'auto';
    setSsmlMode(mode);

    // 3. SSMLがある場合はそれをセット、なければ空
    const currentSsml = phrase.tts_ssml || '';
    setSsml(currentSsml);

    // 4. WordAdjustmentの復元または新規作成
    if (mode === 'auto' && currentSsml) {
      // TODO: 保存済みSSMLから調整状態をパースして復元するロジック
      // 簡易的には既存の初期化を走らせ、SSMLのパース結果をマッピングします
      const words = phrase.phrase_en.split(' ').map((word, i) => ({
        id: `word-${i}`,
        fullText: word,
        text: word.replace(/[.,!?;:]/g, ''),
        emphasis: false,
        emphasisLevel: 'moderate' as const,
        breakAfter: false,
        breakDuration: 300,
        ipa: '',
      }));
      
      // ここで本来は currentSsml を正規表現等で解析し、
      // どの単語に emphasis や break が付いているか adjustments に反映させる処理が必要です。
      setAdjustments(words);
    } else {
      // 新規作成時（またはManual時）のデフォルト初期化
      const words = phrase.phrase_en.split(' ').map((word, i) => ({
        id: `word-${i}`,
        fullText: word,
        text: word.replace(/[.,!?;:]/g, ''),
        emphasis: false,
        emphasisLevel: 'moderate' as const,
        breakAfter: false,
        breakDuration: 300,
        ipa: '',
      }));
      setAdjustments(words);
    }
  }, [phrase]);

  // --- ダイアログ開閉ハンドラ ---
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      // 開く時に既存データを反映
      const mode = phrase.tts_ssml_mode || 'auto';
      setSsmlMode(mode);
      setSsml(phrase.tts_ssml || '');
      setParams(DEFAULT_PARAMS); // 基本パラメータはリセット（必要ならDB保存対象に含める）
      setError(null);

      if (mode === 'auto' && phrase.tts_adjustments) {
        // 保存されたJSONから復元
        setAdjustments(phrase.tts_adjustments);
      } else {
        // 新規または調整データがない場合は原文から生成
        const words = phrase.phrase_en.split(' ').map((word, i) => ({
          id: `word-${i}`,
          fullText: word,
          text: word.replace(/[.,!?;:]/g, ''),
          emphasis: false,
          emphasisLevel: 'moderate' as const,
          breakAfter: false,
          breakDuration: 300,
          ipa: '',
        }));
        setAdjustments(words);
      }
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="max-w-5xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-6 bg-slate-900 text-white">
            <div className="flex justify-between items-center">
              <DialogTitle className="flex items-center gap-2 font-black">
                <Volume2 className="text-indigo-400" size={20} />
                Azure TTS Voice Designer
              </DialogTitle>
            </div>
          </DialogHeader>

          {/* 原文表示セクション：Manual時は操作不可に */}
          <div className={`px-8 py-6 bg-indigo-50/30 border-b border-indigo-100/50 transition-all duration-300 ${ssmlMode === 'manual' ? 'opacity-40 grayscale pointer-events-none' : 'opacity-100'}`}>
            <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-x-2 gap-y-3">
              {adjustments.map((adj) => (
                <Popover key={adj.id}>
                  <PopoverTrigger asChild>
                    <span className={`text-xl font-bold leading-snug tracking-tight cursor-pointer px-1 rounded transition-all border-b-2 
                      ${adj.emphasis || adj.ipa || adj.breakAfter 
                        ? 'text-indigo-600 bg-indigo-100 border-indigo-500' 
                        : 'text-slate-800 border-transparent hover:bg-slate-100'}`}
                    >
                      {adj.fullText}
                    </span>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-4 shadow-xl border-slate-200" align="center">
                    <div className="space-y-5">
                      <div className="flex items-center justify-between border-b pb-2">
                        <span className="text-sm font-black text-slate-700">{adj.text}</span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-rose-500" 
                          onClick={() => updateAdjustment(adj.id, { emphasis: false, breakAfter: false, ipa: '' })}>
                          <RotateCcw size={12} />
                        </Button>
                      </div>
                      
                      {/* 強調設定 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                            <Sparkles size={12} className={adj.emphasis ? "text-amber-500" : ""} /> Emphasis
                          </Label>
                          <Button 
                            variant={adj.emphasis ? "default" : "outline"} 
                            size="sm" className="h-6 px-2 text-[9px]"
                            onClick={() => updateAdjustment(adj.id, { emphasis: !adj.emphasis })}
                          >
                            {adj.emphasis ? "ON" : "OFF"}
                          </Button>
                        </div>
                        {adj.emphasis && (
                          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-md">
                            {(['reduced', 'moderate', 'strong'] as const).map((level) => (
                              <button key={level} onClick={() => updateAdjustment(adj.id, { emphasisLevel: level })}
                                className={`text-[9px] py-1 rounded transition-all ${adj.emphasisLevel === level ? 'bg-white shadow-sm font-bold text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
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
                            <PlusCircle size={12} className={adj.breakAfter ? "text-indigo-500" : ""} /> Pause After
                          </Label>
                          <Button 
                            variant={adj.breakAfter ? "default" : "outline"} 
                            size="sm" className="h-6 px-2 text-[9px]"
                            onClick={() => updateAdjustment(adj.id, { breakAfter: !adj.breakAfter })}
                          >
                            {adj.breakAfter ? "ON" : "OFF"}
                          </Button>
                        </div>
                        {adj.breakAfter && (
                          <div className="space-y-2 px-1">
                            <div className="flex justify-between text-[9px] text-indigo-600 font-mono">
                              <span>Duration:</span>
                              <span>{adj.breakDuration}ms</span>
                            </div>
                            <Slider value={[adj.breakDuration]} min={50} max={1000} step={50} onValueChange={([v]) => updateAdjustment(adj.id, { breakDuration: v })} />
                          </div>
                        )}
                      </div>

                      {/* IPA設定 */}
                      <div className="space-y-1.5 pt-3 border-t">
                        <Label className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1 italic">
                          <Mic2 size={10} /> IPA Pronunciation
                        </Label>
                        <Input value={adj.ipa} onChange={(e) => updateAdjustment(adj.id, { ipa: e.target.value })} className="h-7 text-xs font-mono bg-slate-50" placeholder="ex: æpl" />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 bg-white">
            {/* 左：コントロールパネル */}
            <div className={`p-8 space-y-8 border-r border-slate-100 transition-opacity ${ssmlMode === 'manual' ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
              <div className="space-y-4">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Voice Settings</Label>
                <Select value={params.voice} onValueChange={(v) => setParams(p => ({...p, voice: v}))}>
                  <SelectTrigger className="w-full bg-slate-50 border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en-US-JennyNeural">Jenny (Female)</SelectItem>
                    <SelectItem value="en-US-GuyNeural">Guy (Male)</SelectItem>
                    <SelectItem value="en-US-AriaNeural">Aria (Formal)</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={params.style} onValueChange={(v) => setParams(p => ({...p, style: v}))}>
                  <SelectTrigger className="w-full bg-slate-50 border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="cheerful">Cheerful</SelectItem>
                    <SelectItem value="excited">Excited</SelectItem>
                    <SelectItem value="shouting">Shouting</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Speed: {params.rate}x</Label>
                  <Slider value={[params.rate]} min={0.5} max={1.5} step={0.05} onValueChange={([v]) => setParams(p => ({...p, rate: v}))} />
                </div>
                <div className="space-y-3">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pitch: {params.pitch}%</Label>
                  <Slider value={[params.pitch]} min={-20} max={20} step={1} onValueChange={([v]) => setParams(p => ({...p, pitch: v}))} />
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
                  className={`flex-grow font-mono text-[11px] leading-relaxed text-emerald-400 border-none rounded-none p-5 focus-visible:ring-0 resize-none
                    ${ssmlMode === 'auto' ? 'bg-slate-900/50 opacity-90' : 'bg-slate-900'}`}
                  placeholder="Enter SSML code here..."
                />

                <div className={`flex items-center justify-between px-3 py-2 border-t transition-colors ${ssmlMode === 'manual' ? 'bg-rose-950/30 border-rose-900/30' : 'bg-slate-800 border-slate-700'}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-black/20 p-1 rounded-md">
                      <button 
                        onClick={() => ssmlMode === 'manual' && handleModeToggle(false)}
                        className={`text-[8px] font-black px-2 py-0.5 rounded transition-all ${ssmlMode === 'auto' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}
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
                        className={`text-[8px] font-black px-2 py-0.5 rounded transition-all ${ssmlMode === 'manual' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}
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
                      {copied ? <><Check size={10} className="text-emerald-400" /> COPIED!</> : <><Copy size={10} /> COPY SSML</>}
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

          <DialogFooter className="p-4 bg-white border-t border-slate-100 flex items-center justify-end gap-4 sm:justify-end">
            <Button 
              variant="outline" 
              className="px-8 border-2 border-indigo-100 text-indigo-600 font-bold h-12 rounded-full gap-2 hover:bg-indigo-50 transition-all"
              onClick={() => speak(ssml)}
              disabled={isSpeaking || isProcessing}
            >
              {isSpeaking ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
              LISTEN
            </Button>

            <Button 
              className={`px-12 font-black h-12 rounded-full shadow-lg gap-2 text-white transition-all
                ${ssmlMode === 'manual' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
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
                ? "The audio will be generated and saved using your manually edited SSML code." 
                : "The audio will be generated and saved using the current parameter settings."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowSaveAlert(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleSave} 
              className={ssmlMode === 'manual' ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"}
            >
              Confirm Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}