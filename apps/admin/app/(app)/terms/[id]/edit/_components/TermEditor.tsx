"use client"

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateTerm } from "@/actions/adminTermAction";
import { useToast } from '@gabby/lib/hooks/useToast'
import { Save, Eye, FileEdit, Loader2 } from "lucide-react";
import { TermViewer } from "@gabby/lib/components/term/TermViewer";

interface TermEditorProps {
  termId: string;
  termType: string;
  initialVersion: string;
  initialContent: string;
  storagePath: string;
}

export function TermEditor({ termId, termType, initialVersion, initialContent, storagePath }: TermEditorProps) {
  const [content, setContent] = React.useState(initialContent);
  const [currentStoragePath, setCurrentStoragePath] = React.useState(storagePath);
  
  // 保存判定用のベース値
  const [baseContent, setBaseContent] = React.useState(initialContent);

  const [isSaving, setIsSaving] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"edit" | "preview">("edit");
  const { showToast } = useToast()

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const result = await updateTerm(termId, termType, initialVersion, content, currentStoragePath);
      
      if (result.success && result.newPath) {
        setCurrentStoragePath(result.newPath);
        setBaseContent(content);
        showToast('規約を更新しました', 'success');
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存に失敗しました', 'error')
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = content !== baseContent;

  return (
    <div className="flex flex-col flex-1 border rounded-lg bg-white overflow-hidden shadow-sm">
      {/* ツールバー */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-slate-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-white border rounded-lg p-0.5">
            <Button 
              variant={viewMode === "edit" ? "secondary" : "ghost"} 
              size="sm" 
              onClick={() => setViewMode("edit")}
              className="h-8 gap-2 text-xs font-bold"
            >
              <FileEdit size={14} /> 編集
            </Button>
            <Button 
              variant={viewMode === "preview" ? "secondary" : "ghost"} 
              size="sm" 
              onClick={() => setViewMode("preview")}
              className="h-8 gap-2 text-xs font-bold"
            >
              <Eye size={14} /> プレビュー
            </Button>
          </div>
        </div>

        <Button 
          onClick={handleSave} 
          disabled={isSaving || !hasChanges}
          className="h-9 px-6 bg-indigo-600 hover:bg-indigo-700 font-bold rounded-xl transition-all"
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          保存する
        </Button>
      </div>

      {/* メインエリア */}
      <div className="flex-1 overflow-hidden flex flex-col w-full min-w-0">
        {viewMode === "edit" ? (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full p-6 font-mono text-sm border-none focus-visible:ring-0 resize-none leading-relaxed"
            placeholder="Markdown形式で入力してください..."
          />
        ) : (
          <TermViewer 
            content={content} 
            containerClassName="bg-slate-50/50 p-4 sm:p-8"
            contentClassName="max-w-3xl mx-auto bg-white border rounded-2xl shadow-sm sm:px-12"
          />
        )}
      </div>
    </div>
  );
}