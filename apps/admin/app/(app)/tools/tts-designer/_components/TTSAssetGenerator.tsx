'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Play, Save, Loader2, Volume2, Sparkles, 
  RotateCcw, Mic2, Check, Copy, Settings2, Trash2, MousePointer2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import { WordAdjustment } from '@/types/word';
import { usePlayAzureSpeech, TTSParameters } from '@/hooks/usePlayAzureSpeech';
import { useToast } from '@/hooks/useToast';
import { AZURE_GENERAL_VOICES, AZURE_STYLES, AZURE_VOICES, AzureStyle, AzureVoice } from '@/types/azure';
import { saveTTSAssetAction } from '@/actions/adminTTSAction';
import { cn } from '@/lib/utils';

const DEFAULT_PARAMS: TTSParameters = {
  voice: "en-US-JennyNeural",
  style: "friendly",
  rate: 1.0,
  pitch: 0,
};

export default function TTSAssetGenerator() {
  const [phraseEn, setPhraseEn] = useState('');
  const [memo, setMemo] = useState('');
  const [params, setParams] = useState<TTSParameters>(DEFAULT_PARAMS);
  const [ssml, setSsml] = useState('');
  const [ssmlMode, setSsmlMode] = useState<'auto' | 'manual'>('auto');
  const [adjustments, setAdjustments] = useState<WordAdjustment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showModeAlert, setShowModeAlert] = useState(false);
  const [copied, setCopied] = useState(false);

  const { speak, generateSSML, isSpeaking, error, setError } = usePlayAzureSpeech();
  const { showToast } = useToast();

  // --- リセット処理 ---
  const handleReset = () => {
    setPhraseEn('');
    setMemo('');
    setParams(DEFAULT_PARAMS);
    setAdjustments([]);
    setSsml('');
    setSsmlMode('auto');
    setError(null);
    showToast("All fields cleared", "info");
  };

  // --- 原文入力時に単語リストと初期SSMLをセットアップ ---
  useEffect(() => {
    if (ssmlMode === 'manual') return;
    
    const words: WordAdjustment[] = phraseEn.split(/\s+/).filter(Boolean).map((word, i) => ({
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

    if (phraseEn.trim()) {
      const initialSsml = generateSSML(phraseEn, params);
      setSsml(initialSsml);
      setError(null);
    } else {
      setSsml('');
    }
  }, [phraseEn, generateSSML]); 

  const rebuildSSML = useCallback((currentParams: TTSParameters, currentAdjs: WordAdjustment[]) => {
    if (!phraseEn) return '';
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
  }, [phraseEn, generateSSML]);

  useEffect(() => {
    if (ssmlMode === 'auto' && phraseEn) {
      setSsml(rebuildSSML(params, adjustments));
    }
  }, [params, adjustments, ssmlMode, phraseEn, rebuildSSML]);

  const updateAdjustment = (id: string, updates: Partial<WordAdjustment>) => {
    if (ssmlMode === 'manual') return;
    setAdjustments(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const handleModeToggle = (checked: boolean) => {
    if (!checked) {
      setShowModeAlert(true);
    } else {
      setSsmlMode('manual');
      showToast("Manual edit mode enabled", "info");
    }
  };

  const confirmReturnToAuto = () => {
    setSsmlMode('auto');
    setSsml(rebuildSSML(params, adjustments));
    setShowModeAlert(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(ssml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!phraseEn || !ssml) return;
    setIsProcessing(true);
    try {
      const result = await saveTTSAssetAction({
        raw_text: phraseEn,
        comment: memo || undefined,
        ssml: ssml,
        mode: ssmlMode,
        adjustments: ssmlMode === 'auto' ? { settings: params, words: adjustments } : { isManual: true }
      });
      if (result.success) {
        showToast("Asset saved successfully", "success");
        handleReset();
      }
    } catch (err) {
      showToast("Failed to save asset", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-[1600px] bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all">
      
      {/* SECTION 1: Step 1 - Input Area */}
      <div className="p-8 bg-slate-50 border-b border-slate-200 grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between px-1">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">English Phrase Input</Label>
          </div>
          <Textarea 
            value={phraseEn} 
            onChange={(e) => setPhraseEn(e.target.value)}
            className="h-24 bg-white border-slate-200 font-bold text-xl rounded-2xl focus:ring-4 focus:ring-indigo-500/5 transition-all resize-none shadow-inner"
            placeholder="Type or paste text here..."
          />
        </div>
        <div className="lg:col-span-1 space-y-3">
          <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Optional Memo</Label>
          <Textarea 
            value={memo} 
            onChange={(e) => setMemo(e.target.value)}
            className="h-24 bg-white border-slate-200 text-sm rounded-2xl resize-none"
            placeholder="For admin use..."
          />
        </div>
      </div>

      {/* SECTION 2: Step 2 - Word-Level Tuning */}
      <div className={`px-8 py-10 border-b border-slate-100 bg-white transition-all ${ssmlMode === 'manual' ? 'opacity-30 grayscale pointer-events-none' : 'opacity-100'}`}>
        <div className="flex items-center gap-2 mb-6 px-1">
          <MousePointer2 size={14} className="text-indigo-500" />
          <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Word-Level Fine-Tuning</Label>
        </div>
        
        <div className="flex flex-wrap gap-x-3 gap-y-4">
          {adjustments.length === 0 && <p className="text-slate-300 text-sm italic py-2">Input text above to start tuning...</p>}
          {adjustments.map((adj) => (
            <Popover key={adj.id}>
              <PopoverTrigger asChild>
                <button className={`text-lg font-bold px-3 py-1.5 rounded-xl transition-all border-b-4 active:translate-y-0.5
                  ${adj.emphasis || adj.ipa || adj.breakAfter 
                    ? 'text-indigo-600 bg-indigo-50 border-indigo-500 shadow-sm scale-105' 
                    : 'text-slate-700 border-slate-100 hover:border-slate-300 hover:bg-slate-50'}`}
                >
                  {adj.fullText}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-5 rounded-2xl shadow-2xl border-slate-200" align="start">
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b pb-3">
                    <span className="text-base font-black text-slate-800">{adj.text}</span>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-rose-50 hover:text-rose-500" onClick={() => updateAdjustment(adj.id, { emphasis: false, breakAfter: false, ipa: '' })}>
                      <RotateCcw size={14} />
                    </Button>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Emphasis</Label>
                      <Switch checked={adj.emphasis} onCheckedChange={(v) => updateAdjustment(adj.id, { emphasis: v })} className="scale-75" />
                    </div>
                    {adj.emphasis && (
                      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                        {(['reduced', 'moderate', 'strong'] as const).map((l) => (
                          <button key={l} onClick={() => updateAdjustment(adj.id, { emphasisLevel: l })} className={`text-[10px] font-bold py-1.5 rounded transition-all ${adj.emphasisLevel === l ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>{l}</button>
                        ))}
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-100 space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pause After</Label>
                        <Switch checked={adj.breakAfter} onCheckedChange={(v) => updateAdjustment(adj.id, { breakAfter: v })} className="scale-75" />
                      </div>
                      {adj.breakAfter && (
                        <div className="space-y-3">
                          <div className="flex justify-between text-[10px] font-mono text-indigo-600"><span>Duration</span><span>{adj.breakDuration}ms</span></div>
                          <Slider value={[adj.breakDuration]} min={50} max={1000} step={50} onValueChange={([v]) => updateAdjustment(adj.id, { breakDuration: v })} />
                        </div>
                      )}
                    </div>
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Mic2 size={12}/> IPA Pronunciation</Label>
                      <Input value={adj.ipa} onChange={(e) => updateAdjustment(adj.id, { ipa: e.target.value })} className="h-9 text-sm font-mono bg-slate-50 border-slate-200" placeholder="e.g. tuːmeɪtoʊ" />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ))}
        </div>
      </div>

      {/* SECTION 3: Step 3 - Control Panel & Editor Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 bg-white">
        
        {/* Left: Control Panel (2/5) */}
        <div className={`p-8 lg:col-span-2 border-r border-slate-100 space-y-10 transition-opacity ${ssmlMode === 'manual' ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
          <div className="space-y-3">
            {/* Voice Selector */}
            <div className="space-y-2">
              <Select 
                value={params.voice} 
                onValueChange={(v) => setParams(p => ({...p, voice: v as any}))}
              >
                <SelectTrigger className="h-12 bg-slate-50 border-slate-200 font-bold focus:ring-indigo-500 shadow-sm">
                  <SelectValue placeholder="Select a voice profile" />
                </SelectTrigger>
                
                <SelectContent className="max-h-[250px] w-full shadow-xl border-slate-200">
                  {AZURE_GENERAL_VOICES.map((v) => (
                    <SelectItem 
                      key={v.id} 
                      value={v.id} 
                      className="py-2.5 focus:bg-indigo-50 border-b border-slate-50 last:border-none cursor-pointer"
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          {/* Origin Badge (UK, CA, US) */}
                          <span className="text-[8px] font-black px-1.5 py-0.5 bg-slate-800 text-white rounded-[3px] min-w-[22px] text-center uppercase tracking-tighter">
                            {v.origin}
                          </span>

                          {/* Voice Name */}
                          <span className="font-bold text-slate-900 leading-none">{v.label}</span>

                          {/* Gender Badge (F / M) */}
                          <span className={cn(
                            "text-[7px] px-1 py-0.5 rounded-full font-black uppercase tracking-tighter",
                            v.gender === 'Female' ? "bg-pink-100 text-pink-600" : "bg-blue-100 text-blue-600"
                          )}>
                            {v.gender[0]}
                          </span>

                          {/* --- Recommended / Popular Markings --- */}
                          {v.isRecommended && (
                            <span className="text-[7px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-black uppercase flex items-center gap-0.5 border border-amber-200 shadow-sm">
                              ★ Rec
                            </span>
                          )}
                          {!v.isRecommended && v.isPopular && (
                            <span className="text-[7px] px-1.5 py-0.5 bg-indigo-50 text-indigo-500 rounded-full font-black uppercase border border-indigo-100">
                              Pop
                            </span>
                          )}
                        </div>

                        {/* Tagline (Short visual description) */}
                        <span className="text-[10px] text-indigo-500 font-medium ml-[1.8rem]">
                          {v.tagline}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 詳細説明（選択時のみ表示） */}
              {params.voice && (
                <div className="px-3 py-2.5 bg-indigo-50/30 rounded-xl border border-indigo-100/50 animate-in fade-in slide-in-from-top-1">
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium italic">
                    <span className="text-indigo-600 font-bold not-italic mr-1 text-[9px] uppercase tracking-wider">Note:</span>
                    {AZURE_GENERAL_VOICES.find(v => v.id === params.voice)?.description}
                  </p>
                </div>
              )}
            </div>
            
            {/* Style Select はシンプルに維持 */}
            <Select value={params.style} onValueChange={(v) => setParams(p => ({...p, style: v as any}))}>
              <SelectTrigger className="h-12 bg-slate-50 border-slate-200 font-bold focus:ring-indigo-500 shadow-sm text-sm">
                <SelectValue placeholder="Style (Neutral by default)" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {AZURE_STYLES.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs font-bold">{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Speaking Rate</Label>
                <span className="text-sm font-black text-indigo-600 bg-indigo-50 px-2 rounded">{params.rate}x</span>
              </div>
              <Slider value={[params.rate]} min={0.5} max={1.5} step={0.05} onValueChange={([v]) => setParams(p => ({...p, rate: v}))} />
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Voice Pitch</Label>
                <span className="text-sm font-black text-indigo-600 bg-indigo-50 px-2 rounded">{params.pitch}%</span>
              </div>
              <Slider value={[params.pitch]} min={-20} max={20} step={1} onValueChange={([v]) => setParams(p => ({...p, pitch: v}))} />
            </div>
          </div>
        </div>

        {/* Right: SSML Editor (3/5) - 高さ調整済 */}
        <div className="p-8 lg:col-span-3 bg-slate-50 flex flex-col h-full min-h-[400px]">
          <div className="flex-grow flex flex-col bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-3 bg-slate-900/50 border-b border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-white/5">
                <button onClick={() => ssmlMode === 'manual' && handleModeToggle(false)} className={`text-[9px] font-black px-4 py-1.5 rounded-lg transition-all ${ssmlMode === 'auto' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>AUTO</button>
                <button onClick={() => ssmlMode === 'auto' && handleModeToggle(true)} className={`text-[9px] font-black px-4 py-1.5 rounded-lg transition-all ${ssmlMode === 'manual' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>MANUAL</button>
              </div>
              <Button variant="ghost" size="sm" className="h-8 text-[10px] font-bold text-slate-500 hover:text-white transition-all gap-2" onClick={handleCopy}>
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />} {copied ? 'COPIED' : 'COPY SSML'}
              </Button>
            </div>
            
            <Textarea 
              value={ssml}
              readOnly={ssmlMode === 'auto'}
              onChange={(e) => { setSsml(e.target.value); setError(null); }}
              className={`flex-grow font-mono text-[11px] leading-relaxed text-indigo-300 border-none rounded-none p-8 focus-visible:ring-0 resize-none transition-all ${ssmlMode === 'auto' ? 'bg-transparent opacity-60 cursor-not-allowed' : 'bg-black/20'}`}
              spellCheck={false}
            />
            {error && <div className="px-8 py-4 bg-rose-500/10 border-t border-rose-500/20 text-[10px] font-mono text-rose-400 uppercase tracking-tighter">{error}</div>}
          </div>
        </div>
      </div>

      {/* FOOTER: Global Actions */}
      <footer className="p-8 bg-white border-t border-slate-100 flex items-center justify-between">
        {/* Reset Action */}
        <Button variant="ghost" onClick={handleReset} className="h-12 px-6 text-slate-400 font-bold hover:text-rose-500 hover:bg-rose-50 transition-all gap-2">
          <Trash2 size={16} /> RESET ALL
        </Button>

        <div className="flex items-center gap-4">
          <Button variant="outline" className="h-14 px-8 border-2 border-slate-200 text-slate-800 font-black text-xs tracking-widest rounded-2xl hover:bg-slate-50 transition-all gap-3" onClick={() => speak(ssml)} disabled={isSpeaking || isProcessing || !ssml}>
            {isSpeaking ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} fill="currentColor" />} LISTEN RESULT
          </Button>
          <Button className={`h-14 px-14 font-black text-sm tracking-[0.1em] rounded-2xl shadow-xl transition-all gap-3 text-white
            ${ssmlMode === 'manual' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`} 
            onClick={handleSave} 
            disabled={isProcessing || isSpeaking || !phraseEn}
          >
            {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />} 
            SAVE ASSET
          </Button>
        </div>
      </footer>

      {/* ALERT FOR MODE TOGGLE */}
      <AlertDialog open={showModeAlert} onOpenChange={setShowModeAlert}>
        <AlertDialogContent className="rounded-3xl border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-black text-slate-900">Switch back to Auto Mode?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 font-medium pt-2 leading-relaxed">
              Caution: Your manual SSML modifications will be overwritten by the current UI settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-4 gap-2">
            <AlertDialogCancel className="rounded-xl font-bold border-slate-200 h-11">Keep Manual</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReturnToAuto} className="rounded-xl font-bold bg-indigo-600 h-11 border-none">Reset & Switch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}