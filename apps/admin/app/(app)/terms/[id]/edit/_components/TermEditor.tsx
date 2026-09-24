"use client"

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { addTermRevision } from "@/actions/adminTermAction";
import { useToast } from '@gabby/lib/hooks/useToast'
import { Save, Eye, FileEdit, History, Info, Loader2 } from "lucide-react";
import { TermViewer } from "@gabby/lib/components/term/TermViewer";
import { cn } from "@/lib/utils";
import type { TermDetail } from "@gabby/types/term";

interface TermEditorProps {
  term: TermDetail;
}

type ViewMode = "edit" | "preview" | "history";

export function TermEditor({ term }: TermEditorProps) {
  const t = useTranslations('terms.editor');
  const tErrors = useTranslations('terms.errors');
  const router = useRouter();
  const { showToast } = useToast();

  const currentRevision = term.revisions[0];
  const baseContent = currentRevision?.content ?? "";

  const [content, setContent] = React.useState(baseContent);
  const [changeNote, setChangeNote] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<ViewMode>("edit");
  const [selectedRevisionId, setSelectedRevisionId] = React.useState(currentRevision?.revision_id);

  // 公開済みの規約は利用者が既に目にしている文面の修正となるため、修正理由を必須とする（RPC側でも検証）
  const isChangeNoteRequired = term.is_published;
  const hasChanges = content !== baseContent;
  const canSave = hasChanges && content.trim() !== "" && (!isChangeNoteRequired || changeNote.trim() !== "");

  const selectedRevision = term.revisions.find((rev) => rev.revision_id === selectedRevisionId) ?? currentRevision;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await addTermRevision(term.term_id, content, changeNote);
      if (result.success) {
        showToast(t('toastUpdated', { no: (currentRevision?.revision_no ?? 0) + 1 }), 'success');
        // 最新リビジョンが変わるとpage側のkeyが変わり、本コンポーネントは再マウントされる
        router.refresh();
      } else {
        showToast(tErrors(result.errorCode), 'error');
      }
    } catch {
      showToast(tErrors('UNEXPECTED'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 border rounded-lg bg-white overflow-hidden shadow-sm">
      {/* ツールバー */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-slate-50">
        <div className="flex items-center gap-1 bg-white border rounded-lg p-0.5">
          <Button
            variant={viewMode === "edit" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("edit")}
            className="h-8 gap-2 text-xs font-bold"
          >
            <FileEdit size={14} /> {t('editTab')}
          </Button>
          <Button
            variant={viewMode === "preview" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("preview")}
            className="h-8 gap-2 text-xs font-bold"
          >
            <Eye size={14} /> {t('previewTab')}
          </Button>
          <Button
            variant={viewMode === "history" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("history")}
            className="h-8 gap-2 text-xs font-bold"
          >
            <History size={14} /> {t('historyTab', { count: term.revisions.length })}
          </Button>
        </div>

        {viewMode !== "history" && (
          <Button
            onClick={handleSave}
            disabled={isSaving || !canSave}
            className="h-9 px-6 bg-indigo-600 hover:bg-indigo-700 font-bold rounded-xl transition-all"
          >
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t('saveButton')}
          </Button>
        )}
      </div>

      {/* 保存時の扱い（サイレント更新）の案内と修正理由 */}
      {viewMode !== "history" && (
        <div className="px-4 py-3 border-b space-y-3">
          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-600">
            <Info size={14} className="mt-0.5 shrink-0 text-indigo-500" />
            {term.is_published ? t('silentUpdateNotice') : t('upcomingNotice')}
          </p>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <Label htmlFor="term-change-note" className="shrink-0 text-xs font-bold text-slate-500">
              {t('changeNoteLabel')}
              <span className={cn("ml-1.5 text-[10px]", isChangeNoteRequired ? "text-rose-500" : "text-slate-400")}>
                {isChangeNoteRequired ? t('changeNoteRequired') : t('changeNoteOptional')}
              </span>
            </Label>
            <Input
              id="term-change-note"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder={t('changeNotePlaceholder')}
              maxLength={200}
              className="h-9 text-sm rounded-lg"
            />
          </div>
        </div>
      )}

      {/* メインエリア */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col w-full min-w-0">
        {viewMode === "edit" && (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full p-6 font-mono text-sm border-none focus-visible:ring-0 resize-none leading-relaxed"
            placeholder={t('contentPlaceholder')}
          />
        )}

        {viewMode === "preview" && (
          <TermViewer
            content={content}
            containerClassName="bg-slate-50/50 p-4 sm:p-8"
            contentClassName="max-w-3xl mx-auto bg-white border rounded-2xl shadow-sm sm:px-12"
          />
        )}

        {viewMode === "history" && (
          term.revisions.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-400">{t('noRevisions')}</p>
          ) : (
            <div className="flex flex-1 min-h-0 flex-col md:flex-row">
              <ul className="md:w-72 shrink-0 max-h-48 md:max-h-none overflow-y-auto border-b md:border-b-0 md:border-r divide-y">
                {term.revisions.map((rev) => (
                  <li key={rev.revision_id}>
                    <button
                      type="button"
                      onClick={() => setSelectedRevisionId(rev.revision_id)}
                      className={cn(
                        "w-full text-left px-4 py-3 space-y-1 transition-colors hover:bg-slate-50",
                        rev.revision_id === selectedRevision?.revision_id && "bg-indigo-50/60"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700">{t('revisionLabel', { no: rev.revision_no })}</span>
                        {rev.revision_id === currentRevision?.revision_id && (
                          <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 font-bold text-[10px] px-1.5 py-0">
                            {t('currentBadge')}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-slate-400">
                        {rev.insert_date} · {rev.insert_user_name ?? t('unknownUser')}
                      </p>
                      <p className="text-[12px] text-slate-600 line-clamp-2">
                        {rev.change_note ?? t('noChangeNote')}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex-1 min-h-0 min-w-0 flex flex-col">
                <TermViewer
                  content={selectedRevision?.content ?? ""}
                  containerClassName="bg-slate-50/50 p-4 sm:p-8"
                  contentClassName="max-w-3xl mx-auto bg-white border rounded-2xl shadow-sm sm:px-12"
                />
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
