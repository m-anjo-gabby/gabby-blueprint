'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Bot, User, Trash2, BookOpenCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@gabby/lib/hooks/useToast';
import type { ChatMessage } from '@gabby/lib/ai';

interface KnowledgeSourceRef {
  title: string;
  similarity: number;
}

export default function ChatPlayground() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sourcesByIndex, setSourcesByIndex] = useState<Record<number, KnowledgeSourceRef[]>>({});
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(true);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const history = messages;
    const assistantIndex = history.length + 1;
    setMessages([...history, { role: 'user', content: trimmed }, { role: 'assistant', content: '' }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history, useKnowledgeBase }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const rawSources = response.headers.get('X-Knowledge-Sources');
      if (rawSources) {
        try {
          const sources: KnowledgeSourceRef[] = JSON.parse(decodeURIComponent(rawSources));
          if (sources.length > 0) {
            setSourcesByIndex((prev) => ({ ...prev, [assistantIndex]: sources }));
          }
        } catch {
          // ヘッダーの解析失敗は致命的ではないため無視する
        }
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        const nextText = assistantText;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: nextText };
          return updated;
        });
      }
    } catch (err) {
      console.error('AI Chat Error:', err);
      showToast('Geminiへのリクエストに失敗しました', 'error');
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setSourcesByIndex({});
  };

  return (
    <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
        <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Conversation</p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={useKnowledgeBase} onCheckedChange={setUseKnowledgeBase} className="scale-90" />
            <Label className="text-[11px] font-bold text-slate-500">ヘルプ記事を参照する（RAG）</Label>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-slate-400 hover:text-rose-500 gap-2"
            onClick={handleClear}
            disabled={messages.length === 0 || isLoading}
          >
            <Trash2 size={14} /> Clear
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[480px] px-6 py-6">
        <div className="space-y-5">
          {messages.length === 0 && (
            <p className="text-sm text-slate-300 italic py-10 text-center">
              質問を入力してヘルプアシスタントの回答を検証できます。
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  m.role === 'user' ? 'bg-slate-800 text-white' : 'bg-indigo-600 text-white'
                }`}
              >
                {m.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={`flex flex-col gap-2 max-w-[80%] ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {m.content ? m.content : isLoading && i === messages.length - 1 ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    ''
                  )}
                </div>

                {sourcesByIndex[i] && sourcesByIndex[i].length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {sourcesByIndex[i].map((source, si) => (
                      <Badge
                        key={si}
                        variant="outline"
                        className="text-[10px] px-2 py-0.5 font-bold border-indigo-100 bg-indigo-50 text-indigo-600 gap-1"
                      >
                        <BookOpenCheck size={10} /> {source.title}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={scrollEndRef} />
        </div>
      </ScrollArea>

      <div className="p-6 border-t border-slate-100 bg-white flex items-end gap-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="質問を入力（Shift+Enterで改行）"
          className="min-h-[52px] max-h-40 resize-none rounded-2xl border-slate-200"
          disabled={isLoading}
        />
        <Button
          className="h-[52px] px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700"
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </Button>
      </div>
    </Card>
  );
}
