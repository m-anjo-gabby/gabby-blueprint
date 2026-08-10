'use client';

import { useState } from 'react';
import { Languages, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { useToast } from '@gabby/lib/hooks/useToast';

interface TranslateResult {
  translation: string;
  explanation?: string;
}

export default function TranslatePlayground() {
  const [inputText, setInputText] = useState('');
  const [includeExplanation, setIncludeExplanation] = useState(true);
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  const handleTranslate = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, includeExplanation }),
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data: TranslateResult = await response.json();
      setResult(data);
    } catch (err) {
      console.error('AI Translate Error:', err);
      showToast('翻訳リクエストに失敗しました', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden">
      <div className="p-8 space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              English Text
            </Label>
          </div>
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="SpeechSuperの英文アドバイス等を貼り付けてください..."
            className="h-32 bg-slate-50 border-slate-200 rounded-2xl resize-none"
          />
        </div>

        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Switch checked={includeExplanation} onCheckedChange={setIncludeExplanation} />
            <Label className="text-xs font-bold text-slate-600">学習者向け補足説明を含める</Label>
          </div>

          <Button
            className="h-11 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 gap-2"
            onClick={handleTranslate}
            disabled={isLoading || !inputText.trim()}
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Languages size={16} />}
            翻訳する
          </Button>
        </div>
      </div>

      {result && (
        <div className="border-t border-slate-100 bg-slate-50 p-8 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Sparkles size={14} className="text-indigo-500" />
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                日本語訳
              </Label>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
              {result.translation}
            </div>
          </div>

          {result.explanation && (
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">
                補足説明
              </Label>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">
                {result.explanation}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
