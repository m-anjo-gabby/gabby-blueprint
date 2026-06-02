"use client"

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateTerm } from "@/actions/adminTermAction";
import { useToast } from '@gabby/lib/hooks/useToast'
import { Save, Eye, FileEdit, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
          /* 💡 生徒側のScrollArea内のViewportおよび背景設定と同期 */
          <div className="h-full overflow-y-auto p-4 sm:p-8 bg-slate-50/50 w-full min-w-0">
            {/* 💡 生徒側モーダルのインナーコンテナ構造（幅・余白・影・折り返し制御）を完全に再現 */}
            <div className="max-w-3xl mx-auto bg-white px-8 py-10 sm:px-12 border rounded-2xl shadow-sm w-full min-w-0 break-words">
              {/* 💡 proseクラスから不要な装飾設定を除去し、最優先の独自タグコンポーネントを差し込み */}
              <article className="prose prose-indigo prose-sm sm:prose-base max-w-none break-words [word-break:break-word]">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // 💡 H1 (#) の見た目を強制上書き（最優先にするため ! を付与）
                    h1: ({ node, ...props }) => (
                      <h1 {...props} className="!text-xl sm:!text-2xl !font-black !tracking-tight !text-slate-900 !mt-2 !mb-6" />
                    ),
                    // 💡 H3 (###) の見た目を強制上書き
                    h3: ({ node, ...props }) => (
                      <h3 {...props} className="!text-sm sm:!text-base !font-bold !text-slate-700 !mt-8 !mb-3" />
                    ),
                    // 💡 段落 (<p>) の改行制御を強制上書き。これで Enter 単体の改行が100%効きます
                    p: ({ node, ...props }) => (
                      <p {...props} className="!whitespace-pre-wrap !leading-relaxed !text-slate-600 !my-4" />
                    )
                  }}
                >
                  {content}
                </ReactMarkdown>
              </article>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}