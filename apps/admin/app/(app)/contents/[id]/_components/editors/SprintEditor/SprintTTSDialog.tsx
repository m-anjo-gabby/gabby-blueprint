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
import { SprintQuestion } from '@gabby/types/sprint';
import { TTSAdjustmentData, WordAdjustment } from '@gabby/types/word';
import { usePlayAzureSpeech, TTSParameters } from '@gabby/lib/hooks/usePlayAzureSpeech';
import { useToast } from '@gabby/lib/hooks/useToast';
import { AZURE_STYLES, AZURE_VOICES, AzureStyle, AzureVoice } from '@gabby/types/azure';
import { saveSprintAudio } from '@/actions/adminSprintAction';

interface SprintTTSDialogProps {
  question: SprintQuestion;
  section: 'statement' | 'question' | 'answer_yes' | 'answer_no';
  onUpdate: () => void;
  children: React.ReactNode;
}

const DEFAULT_PARAMS: TTSParameters = {
  voice: "en-US-JennyNeural",
  style: "friendly",
  rate: 1.0,
  pitch: 0,
};

export function SprintTTSDialog({ question, section, onUpdate, children }: SprintTTSDialogProps) {
  const [open, setOpen] = useState(false);
  const [params, setParams] = useState<TTSParameters>(DEFAULT_PARAMS);
  const [ssml, setSsml] = useState('');
  const [ssmlMode, setSsmlMode] = useState<'auto' | 'manual'>('auto');
  const [adjustments, setAdjustments] = useState<WordAdjustment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showModeAlert, setShowModeAlert] = useState(false);
  const [showSaveAlert, setShowSaveAlert] = useState(false);

  const { speak, generateSSML, isSpeaking, error } = usePlayAzureSpeech();
  const { showToast } = useToast();

  // 💡 修正: セクションに応じたテキストとメタデータの取得を _en スキーマに対応
  const getSectionData = useCallback(() => {
    switch (section) {
      case 'statement':
        return {
          text: question.statement_en || '',
          ssml: question.statement_tts_ssml,
          mode: question.statement_tts_ssml_mode,
          adjust: question.statement_tts_adjustments,
          voice: question.statement_voice
        };
      case 'question':
        return {
          text: question.question_en || '',
          ssml: question.question_tts_ssml,
          mode: question.question_tts_ssml_mode,
          adjust: question.question_tts_adjustments,
          voice: question.question_voice
        };
      case 'answer_yes':
        return {
          text: question.answer_sentence_yes_en || '',
          ssml: question.answer_sentence_yes_tts_ssml,
          mode: question.answer_sentence_yes_tts_ssml_mode,
          adjust: question.answer_sentence_yes_tts_adjustments,
          voice: question.answer_sentence_yes_voice
        };
      case 'answer_no':
        return {
          text: question.answer_sentence_no_en || '',
          ssml: question.answer_sentence_no_tts_ssml,
          mode: question.answer_sentence_no_tts_ssml_mode,
          adjust: question.answer_sentence_no_tts_adjustments,
          voice: question.answer_sentence_no_voice
        };
    }
  }, [question, section]);

  const currentData = getSectionData();

  useEffect(() => {
    if (open) {
      const data = getSectionData();
      setSsmlMode(data.mode || 'auto');
      setSsml(data.ssml || '');

      const words = data.text.split(' ').filter(Boolean).map((word, i) => ({
        id: `word-${i}`,
        fullText: word,
        text: word.replace(/[.,!?;:]/g, ''),
        emphasis: false,
        emphasisLevel: 'moderate' as const,
        breakAfter: false,
        breakDuration: 300,
        ipa: '',
      }));

      if (data.adjust) {
        const adjData = data.adjust as unknown as TTSAdjustmentData;
        if (adjData.settings) {
          setParams({
            voice: (adjData.settings.voice as AzureVoice) || DEFAULT_PARAMS.voice,
            style: (adjData.settings.style as AzureStyle) || DEFAULT_PARAMS.style,
            rate: adjData.settings.rate ?? DEFAULT_PARAMS.rate,
            pitch: adjData.settings.pitch ?? DEFAULT_PARAMS.pitch,
          });
        }
        if (adjData.words && adjData.words.length > 0) {
          const merged = words.map((base, i) => {
            const saved = adjData.words[i];
            return (saved && saved.text === base.text) ? { ...base, ...saved } : base;
          });
          setAdjustments(merged);
        } else {
          setAdjustments(words);
        }
      } else {
        setParams(DEFAULT_PARAMS);
        setAdjustments(words);
      }
    }
  }, [open, getSectionData]);

  const rebuildSSML = useCallback((currentParams: TTSParameters, currentAdjs: WordAdjustment[]) => {
    const processedText = currentAdjs.map(adj => {
      let segment = adj.fullText;
      if (adj.ipa.trim()) {
        const punctuation = adj.fullText.slice(adj.text.length);
        segment = `<phoneme alphabet="ipa" ph="${adj.ipa.trim()}">${adj.text}</phoneme>${punctuation}`;
      }
      if (adj.emphasis) segment = `<emphasis level="${adj.emphasisLevel}">${segment}</emphasis>`;
      if (adj.breakAfter) segment = `${segment}<break time="${adj.breakDuration}ms"/>`;
      return segment;
    }).join(' ');
    return generateSSML(processedText, currentParams);
  }, [generateSSML]);

  useEffect(() => {
    if (ssmlMode === 'auto' && open) {
      setSsml(rebuildSSML(params, adjustments));
    }
  }, [params, adjustments, ssmlMode, rebuildSSML, open]);

  const updateAdjustment = (id: string, updates: Partial<WordAdjustment>) => {
    if (ssmlMode === 'manual') return;
    setAdjustments(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const handleSave = async () => {
    setIsProcessing(true);
    try {
      const adjustmentData: TTSAdjustmentData = {
        settings: params,
        words: adjustments,
      };

      const result = await saveSprintAudio(
        question.content_id,
        question.question_id,
        section,
        question.question_type,
        question.difficulty_level,
        ssml,
        ssmlMode,
        adjustmentData,
        currentData.voice
      );

      if (result.success) {
        showToast("音声を保存しました", "success");
        onUpdate();
        setOpen(false);
      } else {
        showToast(result.message || "保存に失敗しました", "error");
      }
    } catch (e) {
      showToast("エラーが発生しました", "error");
    } finally {
      setIsProcessing(false);
      setShowSaveAlert(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="max-w-5xl p-0 overflow-hidden border-none shadow-2xl focus:outline-none">
          <DialogHeader className="p-8 bg-slate-900 text-white border-b border-slate-800">
            <DialogTitle className="flex items-center gap-2 font-black text-xl">
              <Volume2 className="text-indigo-400" size={24} />
              Sprint TTS Designer - {section.toUpperCase()}
            </DialogTitle>
          </DialogHeader>

          <div className={`px-8 py-6 bg-indigo-50/30 border-b border-indigo-100/50 ${ssmlMode === 'manual' ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
            <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-x-2 gap-y-3">
              {adjustments.map((adj) => (
                <Popover key={adj.id}>
                  <PopoverTrigger asChild>
                    <span className={`text-xl font-bold px-1 rounded transition-all border-b-2 cursor-pointer
                      ${adj.emphasis || adj.ipa || adj.breakAfter ? 'text-indigo-600 bg-indigo-100 border-indigo-500' : 'text-slate-800 border-transparent hover:bg-slate-100'}`}
                    >
                      {adj.fullText}
                    </span>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-4 shadow-xl border-slate-200">
                    <div className="space-y-5">
                      <div className="flex items-center justify-between border-b pb-2">
                        <span className="text-sm font-black text-slate-700">{adj.text}</span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => updateAdjustment(adj.id, { emphasis: false, breakAfter: false, ipa: '' })}>
                          <RotateCcw size={12} />
                        </Button>
                      </div>

                      {/* 💡 改善: ロジック上存在していた IPA (発音記号) 調整用の UI 入力欄を追加 */}
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                          <Mic2 size={12} className={adj.ipa ? "text-indigo-500" : ""} /> IPA Pronunciation
                        </Label>
                        <Input 
                          placeholder="e.g. dædi" 
                          value={adj.ipa} 
                          onChange={(e) => updateAdjustment(adj.id, { ipa: e.target.value })}
                          className="h-8 font-mono text-xs rounded-lg"
                        />
                      </div>

                      <div className="space-y-2 border-t pt-3">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                          <Sparkles size={12} className={adj.emphasis ? "text-amber-500" : ""} /> Emphasis
                        </Label>
                        <div className="flex justify-end">
                          <Button variant={adj.emphasis ? "default" : "outline"} size="sm" className="h-6 px-2 text-[9px]" onClick={() => updateAdjustment(adj.id, { emphasis: !adj.emphasis })}>
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
                      <div className="space-y-2 border-t pt-3">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                          <PlusCircle size={12} className={adj.breakAfter ? "text-indigo-500" : ""} /> Pause After
                        </Label>
                        <div className="flex justify-end">
                          <Button variant={adj.breakAfter ? "default" : "outline"} size="sm" className="h-6 px-2 text-[9px]" onClick={() => updateAdjustment(adj.id, { breakAfter: !adj.breakAfter })}>
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
                    </div>
                  </PopoverContent>
                </Popover>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 bg-white">
            <div className={`p-8 space-y-8 border-r border-slate-100 ${ssmlMode === 'manual' ? 'opacity-40 pointer-events-none' : ''}`}>
              <div className="space-y-4">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Voice Settings</Label>
                <Select value={params.voice} onValueChange={(v) => setParams(p => ({...p, voice: v as AzureVoice}))}>
                  <SelectTrigger className="w-full bg-slate-50 border-slate-200 font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent>{AZURE_VOICES.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={params.style} onValueChange={(v) => setParams(p => ({...p, style: v as AzureStyle}))}>
                  <SelectTrigger className="w-full bg-slate-50 border-slate-200 font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent>{AZURE_STYLES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
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

            <div className="p-8 bg-slate-50 flex flex-col h-full">
              <div className="flex justify-between items-center mb-3">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">SSML Code <Sparkles size={10} className="text-indigo-500" /></Label>
              </div>
              <div className="flex-grow flex flex-col border border-slate-200 rounded-xl overflow-hidden shadow-inner bg-slate-900">
                <Textarea value={ssml} readOnly={ssmlMode === 'auto'} onChange={(e) => setSsml(e.target.value)} className="flex-grow font-mono text-[11px] leading-relaxed text-emerald-400 border-none rounded-none p-5 focus-visible:ring-0 resize-none bg-transparent min-h-[200px]" />
                <div className={`flex items-center justify-between px-3 py-2 border-t ${ssmlMode === 'manual' ? 'bg-rose-950/30 border-rose-900/30' : 'bg-slate-800 border-slate-700'}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-black/20 p-1 rounded-md">
                      <button onClick={() => ssmlMode === 'manual' && setShowModeAlert(true)} className={`text-[8px] font-black px-2 py-0.5 rounded ${ssmlMode === 'auto' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-500'}`}>AUTO</button>
                      <Switch checked={ssmlMode === 'manual'} onCheckedChange={(checked) => checked ? setSsmlMode('manual') : setShowModeAlert(true)} className="data-[state=checked]:bg-rose-500 scale-75" />
                      <button onClick={() => ssmlMode === 'auto' && setSsmlMode('manual')} className={`text-[8px] font-black px-2 py-0.5 rounded ${ssmlMode === 'manual' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-500'}`}>MANUAL</button>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 text-[9px] font-bold text-slate-400 gap-1.5" onClick={() => navigator.clipboard.writeText(ssml)}>
                    <Copy size={10} /> COPY
                  </Button>
                </div>
              </div>
              {error && <div className="mt-3 p-3 bg-rose-50 border border-rose-100 rounded-lg text-[9px] text-rose-600 font-mono">{error}</div>}
            </div>
          </div>

          <DialogFooter className="p-4 bg-white border-t flex gap-3">
            <Button variant="outline" className="px-8 border-2 border-indigo-100 text-indigo-600 font-bold h-12 rounded-full gap-2" onClick={() => speak(ssml)} disabled={isSpeaking || isProcessing}>
              {isSpeaking ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
              LISTEN
            </Button>
            <Button className={`px-12 font-black h-12 rounded-full shadow-lg gap-2 text-white ${ssmlMode === 'manual' ? 'bg-rose-600' : 'bg-indigo-600'}`} onClick={() => setShowSaveAlert(true)} disabled={isProcessing || isSpeaking}>
              {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              SAVE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showModeAlert} onOpenChange={setShowModeAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to Auto Mode?</AlertDialogTitle>
            <AlertDialogDescription>Your manual edits will be discarded.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setSsmlMode('auto'); setShowModeAlert(false); }} className="bg-indigo-600">Switch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSaveAlert} onOpenChange={setShowSaveAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Audio?</AlertDialogTitle>
            <AlertDialogDescription>Generate and save audio for this section.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave} className={ssmlMode === 'manual' ? "bg-rose-600" : "bg-indigo-600"}>Confirm Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}