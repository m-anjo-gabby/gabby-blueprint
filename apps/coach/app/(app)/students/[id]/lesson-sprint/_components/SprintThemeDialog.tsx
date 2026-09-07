'use client';

import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SprintThemeEntry } from '@gabby/lib';

interface Props {
  entry: SprintThemeEntry | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "**text**" で囲んだ範囲だけ<strong>にする軽量記法パーサー */
function renderBoldText(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, idx) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={idx}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={idx}>{part}</span>
    )
  );
}

/** 改行(\n)区切りの複数段落を、それぞれ renderBoldText で描画する */
function MultilineBoldText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, idx) => (
        <p key={idx} className={idx > 0 ? 'mt-1' : undefined}>
          {renderBoldText(line)}
        </p>
      ))}
    </>
  );
}

export function SprintThemeDialog({ entry, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="sm:max-w-md border-none bg-white p-6 shadow-2xl rounded-2xl text-slate-900 max-h-[85vh] overflow-y-auto"
      >
        {entry ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-sm font-black text-slate-400 tracking-wider">{entry.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-3">
              <div className="text-sm font-bold text-slate-700 leading-relaxed">
                <MultilineBoldText text={entry.summary} />
              </div>

              {entry.bullets && entry.bullets.length > 0 && (
                <ul className="space-y-1 text-xs text-slate-600 font-semibold">
                  {entry.bullets.map((bullet, idx) => (
                    <li key={idx}>• {renderBoldText(bullet)}</li>
                  ))}
                </ul>
              )}

              {entry.examples.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <h4 className="text-xs font-black text-indigo-600 uppercase tracking-wider">Example Questions</h4>
                  <div className="space-y-2.5">
                    {entry.examples.map((example, idx) => (
                      <div key={idx} className="text-xs leading-relaxed">
                        {example.cue && <p className="font-black text-slate-500">{example.cue}</p>}
                        {example.prompt && <p className="font-bold text-slate-800">{renderBoldText(example.prompt)}</p>}
                        <p className="text-slate-600">{renderBoldText(example.answer)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="py-8 text-center">
            <p className="text-xs font-semibold text-slate-400">No additional details available for this level yet.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
