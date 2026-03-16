'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Play, Save, Volume2, Info, Sparkles, RotateCcw } from 'lucide-react';
import { PhraseRecord } from '@/types/word';
import { generateAndSaveTTS } from '@/actions/adminTTSAction';
import { useAzureSpeech, TTSParameters } from '@/hooks/useAzureSpeech';
import { useToast } from '@/hooks/useToast';

interface TTSDialogProps {
  phrase: PhraseRecord;
  onUpdate: () => void;
  children: React.ReactNode;
}

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
  const [isProcessing, setIsProcessing] = useState(false);
  
  const { speak, generateSSML, isSpeaking } = useAzureSpeech();
  const { showToast } = useToast();

  // パラメータが変更されたらSSMLを自動生成して反映
  useEffect(() => {
    const newSsml = generateSSML(phrase.phrase_en, params);
    setSsml(newSsml);
  }, [params, phrase.phrase_en, generateSSML]);

  // 1. ローカルプレビュー（Azure SDK経由でブラウザから直接再生）
  const handleLocalPreview = () => {
    speak(phrase.phrase_en, params);
  };

  // 2. 確定保存（サーバーアクション経由でStorage保存 & DB更新）
  const handleSave = async () => {
    setIsProcessing(true);
    try {
      const result = await generateAndSaveTTS(phrase.phrase_id, ssml);
      if (result.success) {
        showToast("音声を生成・保存しました", "success");
        onUpdate();
        setOpen(false);
      } else {
        showToast(result.message || "保存に失敗しました", "error");
      }
    } catch (error) {
      showToast("システムエラーが発生しました", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 bg-slate-900 text-white">
          <DialogTitle className="flex items-center gap-2 font-black">
            <Volume2 className="text-indigo-400" size={20} />
            Azure TTS Voice Designer
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 bg-white">
          {/* 左カラム：コントロールパネル */}
          <div className="p-8 space-y-8 border-r border-slate-100">
            <div className="space-y-4">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Voice Settings</Label>
              <Select value={params.voice} onValueChange={(v) => setParams(p => ({...p, voice: v}))}>
                <SelectTrigger className="w-full bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Select Voice" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en-US-JennyNeural">Jenny (Standard Female)</SelectItem>
                  <SelectItem value="en-US-GuyNeural">Guy (Standard Male)</SelectItem>
                  <SelectItem value="en-US-AriaNeural">Aria (Formal Female)</SelectItem>
                </SelectContent>
              </Select>

              <Select value={params.style} onValueChange={(v) => setParams(p => ({...p, style: v}))}>
                <SelectTrigger className="w-full bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Select Style" />
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
                <div className="flex justify-between">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Speed: {params.rate}x</Label>
                </div>
                <Slider 
                  value={[params.rate]} min={0.5} max={1.5} step={0.05} 
                  onValueChange={([v]) => setParams(p => ({...p, rate: v}))} 
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pitch: {params.pitch}%</Label>
                </div>
                <Slider 
                  value={[params.pitch]} min={-20} max={20} step={1}
                  onValueChange={([v]) => setParams(p => ({...p, pitch: v}))} 
                />
              </div>
            </div>

            <Button 
              variant="outline" 
              className="w-full py-6 border-2 border-indigo-100 hover:border-indigo-200 hover:bg-indigo-50/50 text-indigo-600 font-bold gap-2"
              onClick={handleLocalPreview}
              disabled={isSpeaking}
            >
              {isSpeaking ? <Loader2 className="animate-spin" size={20} /> : <Play size={20} />}
              プレビュー試聴
            </Button>
          </div>

          {/* 右カラム：SSMLエディタ */}
          <div className="p-8 bg-slate-50 space-y-4">
            <div className="flex justify-between items-center">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                SSML Code <Sparkles size={10} className="text-indigo-500" />
              </Label>
              <Button variant="ghost" size="sm" onClick={() => setParams(DEFAULT_PARAMS)} className="h-6 text-[10px] gap-1">
                <RotateCcw size={10} /> Reset
              </Button>
            </div>
            <Textarea 
              value={ssml}
              onChange={(e) => setSsml(e.target.value)}
              className="h-[320px] font-mono text-[10px] leading-relaxed bg-slate-900 text-emerald-400 border-none rounded-xl shadow-inner p-4 focus-visible:ring-1 focus-visible:ring-indigo-500"
            />
            <div className="flex gap-2 text-amber-600 text-[10px] leading-tight bg-amber-50 p-3 rounded-lg border border-amber-100">
              <Info size={14} className="shrink-0" />
              <p>特殊な読み方はSSMLを直接編集してください。タグを手動更新した場合はスライダーの設定よりも優先されます。</p>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 bg-white border-t border-slate-100">
          <Button 
            className="w-full md:w-auto px-12 bg-indigo-600 hover:bg-indigo-700 text-white font-black h-12 rounded-full shadow-lg shadow-indigo-200 gap-2" 
            onClick={handleSave}
            disabled={isProcessing}
          >
            {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            この設定で音声を確定保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}