// apps/admin/app/(app)/terms/[id]/edit/_components/TermEditor.tsx
"use client"

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateTermContent } from "@/actions/adminTermAction";
import { useToast } from '@gabby/lib/hooks/useToast'
import { Save, Eye, FileEdit, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown"; // インストールが必要
import remarkGfm from "remark-gfm";

interface TermEditorProps {
  initialContent: string;
  storagePath: string;
}

export function TermEditor({ initialContent, storagePath }: TermEditorProps) {
  const [content, setContent] = React.useState(initialContent);
  const [isSaving, setIsSaving] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"edit" | "preview">("edit");
  const { showToast } = useToast()

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await updateTermContent(storagePath, content);
      showToast('規約内容を更新しました', 'success')
    } catch (error) {
      showToast('保存に失敗しました', 'error')
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 border rounded-lg bg-white overflow-hidden shadow-sm">
      {/* ツールバー */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-slate-50">
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

        <Button 
          onClick={handleSave} 
          disabled={isSaving || content === initialContent}
          className="h-9 px-6 bg-indigo-600 hover:bg-indigo-700 font-bold rounded-xl transition-all"
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          保存する
        </Button>
      </div>

      {/* メインエリア */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "edit" ? (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full p-6 font-mono text-sm border-none focus-visible:ring-0 resize-none leading-relaxed"
            placeholder="Markdown形式で入力してください..."
          />
        ) : (
          <div className="h-full overflow-y-auto p-8 bg-slate-50/30">
            <div className="max-w-3xl mx-auto bg-white p-12 border shadow-sm prose prose-slate">
              {/* prose クラスは tailwindcss/typography を想定 */}
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}