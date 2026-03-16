'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Play, Save, Volume2, Info, Sparkles } from 'lucide-react';
import { PhraseRecord } from '@/types/word';
import { generateAndSaveTTS, previewTTS } from '@/actions/adminTTSAction';
import { useToast } from '@/hooks/useToast';

interface TTSDialogProps {
  phrase: PhraseRecord;
  onUpdate: () => void;
  children: React.ReactNode;
}

export function TTSDialog({ phrase, onUpdate, children }: TTSDialogProps) {
  const [open, setOpen] = useState(false);
  const [ssml, setSsml] = useState(phrase.tts_ssml || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const { showToast } = useToast();

  // 1. プレビュー再生（保存せず音くだけ）
  const handlePreview = async () => {
    if (!ssml) return;
    setIsPreviewing(true);
    try {
      // サーバーアクションでAzureから音声バイナリ(Base64)を取得
      const result = await previewTTS(ssml);
      if (result.success && result.audioData) {
        const audio = new Audio(`data:audio/mp3;base64,${result.audioData}`);
        audio.play();
      } else {
        showToast("プレビュー生成に失敗しました", "error");
      }
    } catch (error) {
      showToast("通信エラーが発生しました", "error");
    } finally {
      setIsPreviewing(false);
    }
  };

  // 2. 確定保存（Storageに保存してDB更新）
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
      <DialogContent className="max-w-2xl p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 bg-slate-900 text-white">
          <DialogTitle className="flex items-center gap-2 font-black">
            <Volume2 className="text-indigo-400" size={20} />
            Azure TTS 音声調整
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-6 bg-white">
          {/* フレーズの原文確認 */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Original Phrase</Label>
            <p className="text-lg font-bold text-slate-800">{phrase.phrase_en}</p>
            <p className="text-sm text-slate-500">{phrase.phrase_ja}</p>
          </div>

          {/* SSMLエディタ */}
          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                SSML Editor <Sparkles size={10} className="text-indigo-500" />
              </Label>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-[10px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                onClick={() => setSsml(phrase.tts_ssml || '')}
              >
                リセット
              </Button>
            </div>
            <Textarea 
              value={ssml}
              onChange={(e) => setSsml(e.target.value)}
              className="font-mono text-xs leading-relaxed h-48 bg-slate-900 text-emerald-400 border-none rounded-xl focus-visible:ring-2 focus-visible:ring-indigo-500"
              placeholder="<speak>...</speak>"
            />
          </div>

          {/* ヒント */}
          <div className="flex gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100 text-[11px] text-amber-700 leading-tight">
            <Info size={14} className="shrink-0" />
            <p>
              専門用語の発音が不自然な場合は <code>&lt;phoneme alphabet=&quot;ipa&quot; ph=&quot;...&quot;&gt;</code> タグを使用してIPA記号で発音を指定してください。
            </p>
          </div>
        </div>

        <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
          <Button 
            variant="outline" 
            className="flex-1 font-bold gap-2" 
            onClick={handlePreview} 
            disabled={isPreviewing || isProcessing}
          >
            {isPreviewing ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
            プレビュー試聴
          </Button>
          <Button 
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2" 
            onClick={handleSave}
            disabled={isProcessing || isPreviewing}
          >
            {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            音声を生成して保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}