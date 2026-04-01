// src\app\(app)\admin\contents\[id]\_components\editors\WordEditor\index.tsx
'use client';

import { 
  ResizableHandle, 
  ResizablePanel, 
  ResizablePanelGroup 
} from "@/components/ui/resizable";
import { WordList } from "./WordList";
import { PhraseList } from "./PhraseList";
import { Search } from "lucide-react";

interface WordEditorProps {
  contentId: string;
  selectedWordId?: string;
}

export function WordEditor({ contentId, selectedWordId }: WordEditorProps) {
  return (
    <div className="flex-1 min-h-0 min-w-0 w-full border-t border-slate-200 bg-white flex overflow-hidden">
      <ResizablePanelGroup 
        orientation="horizontal" 
        className="flex-1 w-full min-w-0"
      >
        {/* 左ペイン：単語リスト */}
        <ResizablePanel 
          id="panel-word-list"
          defaultSize={30}
          minSize={20}
          className="flex flex-col min-w-0 overflow-hidden"
        >
          <WordList 
            contentId={contentId} 
          />
        </ResizablePanel>

        {/* 境界線 */}
        <ResizableHandle withHandle className="w-1.5 bg-slate-200 hover:bg-indigo-300 transition-colors" />

        {/* 右ペイン：フレーズ詳細 */}
        <ResizablePanel 
          id="panel-phrase-detail"
          defaultSize={70}
          className="flex flex-col min-w-0 overflow-hidden bg-slate-50"
        >
          {selectedWordId ? (
            <PhraseList wordId={selectedWordId} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
               <div className="p-6 bg-white rounded-full shadow-sm">
                 <Search size={32} className="text-slate-200" />
               </div>
               <p className="text-sm font-medium italic">Select a word to manage phrases</p>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}