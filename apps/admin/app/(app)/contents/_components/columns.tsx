'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import type { useTranslations } from 'next-intl';
import { ArrowRight, Building2, EyeOff, Globe, Lock, Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type Content, type ContentType, CONTENT_TYPES, CONTENT_SCOPES } from '@gabby/types/content';
import { getContentTypeConfig } from '@gabby/lib/content/ui';
import { ContentFormDialog } from './ContentFormDialog';
import { ContentTagDialog } from './ContentTagDialog';
import { ContentAccessDialog } from './ContentAccessDialog';

type TableT = ReturnType<typeof useTranslations<'contents.dataTable'>>;

/**
 * 種別ごとのエディタ導線設定（ビデオ(1)はエディタ未実装のため定義しない）。
 * 色・アイコンは種別バッジと同じく getContentTypeConfig（全アプリ共通の分類色）から取得する。
 */
const EDITOR_LABEL_KEYS: Partial<Record<ContentType, "word" | "sprint" | "dialogue">> = {
  0: "word",
  2: "sprint",
  3: "dialogue",
};

function getEditorHref(content: Content): string {
  if (content.content_type === 2) {
    const questionType = content.metadata?.question_type;
    return `/contents/${content.content_id}?type=${typeof questionType === "string" ? questionType : "0"}`;
  }
  return `/contents/${content.content_id}`;
}

export function createColumns(t: TableT): ColumnDef<Content>[] {
  return [
    {
      accessorKey: "content_name",
      header: t('nameHeader'),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5 py-1">
          {/* エディタがある種別は教材名からも遷移できるようにする（操作列ボタンの補助導線） */}
          {EDITOR_LABEL_KEYS[row.original.content_type] ? (
            <Link
              href={getEditorHref(row.original)}
              className="text-sm font-bold text-slate-900 leading-tight w-fit hover:text-brand hover:underline underline-offset-2 transition-colors"
            >
              {row.original.content_name}
            </Link>
          ) : (
            <span className="text-sm font-bold text-slate-900 leading-tight">
              {row.original.content_name}
            </span>
          )}
          {row.original.content_name_en && (
            <span className="text-[11px] text-slate-500 italic truncate max-w-[200px]">
              {row.original.content_name_en}
            </span>
          )}
          <span className="text-[10px] text-slate-400 font-mono font-medium tracking-tight truncate max-w-[200px]">
            {row.original.content_label}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "content_type",
      header: t('typeHeader'),
      cell: ({ row }) => {
        const type = row.original.content_type;
        const { icon: TypeIcon, theme } = getContentTypeConfig(type);

        return (
          <Badge variant="outline" className={`${theme.chip} gap-1 font-bold text-[10px] px-2`}>
            <TypeIcon size={12} />
            {CONTENT_TYPES[type]?.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "content_scope",
      header: t('scopeHeader'),
      cell: ({ row }) => {
        const content = row.original;
        const scope = content.content_scope as keyof typeof CONTENT_SCOPES;
        const config = CONTENT_SCOPES[scope];
        const clients = content.access_clients || [];
        const isAlert = scope === 1 && clients.length === 0;

        const styles = {
          0: { icon: <Globe size={11} />, text: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
          1: { icon: <Lock size={11} />, text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100" },
          9: { icon: <EyeOff size={11} />, text: "text-slate-500", bg: "bg-slate-100", border: "border-slate-200" },
        }[scope];

        // 限定(1)の場合のみ、全体をダイアログのトリガーにする
        if (scope === 1) {
          return (
            <ContentAccessDialog content={content}>
              <div className="group/access flex items-center gap-4 cursor-pointer py-2 w-fit">
                {/* 左側：公開状況の塊 */}
                <div className="flex flex-col gap-1 min-w-32.5">
                  {/* 上段：限定バッジ（状態を示すことに専念） */}
                  <div className={`
                    flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-all w-fit
                    ${isAlert ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100 group-hover/access:bg-amber-100 group-hover/access:border-amber-300'}
                  `}>
                    <Lock size={11} className={`${isAlert ? 'text-rose-500' : 'text-amber-600'} opacity-70`} />
                    <span className={`text-[10px] font-black tracking-tight ${isAlert ? 'text-rose-600' : 'text-amber-600'}`}>
                      {config?.label}
                    </span>
                  </div>

                  {/* 下段：クライアント名またはエラーメッセージ */}
                  <div className="flex items-center gap-1.5 pl-1 transition-colors">
                    {isAlert ? (
                      <span className="text-[10px] font-bold text-rose-400 italic">{t('accessAlertHint')}</span>
                    ) : (
                      <div className="flex items-center gap-1.5 text-slate-500 group-hover/access:text-amber-700">
                        <Building2 size={10} className="text-slate-300 group-hover/access:text-amber-400 shrink-0" />
                        <span className="text-[11px] font-bold text-slate-600 group-hover/access:text-amber-800 truncate max-w-25">
                          {clients[0]?.client_name}
                        </span>
                        {clients.length > 1 && (
                          <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-100 px-1 rounded-sm">
                            +{clients.length - 1}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 右側：アクションボタン（未設定ならPlus、設定済みならPencil） */}
                <div className={`
                  flex items-center justify-center w-6 h-6 rounded-xl shadow-sm transition-all duration-300 group-hover/access:scale-105 group-hover/access:shadow-md
                  ${isAlert 
                    ? "bg-rose-50 text-rose-500 border border-rose-100 group-hover/access:bg-rose-600 group-hover/access:text-white group-hover/access:border-rose-600" 
                    : "bg-amber-50 text-amber-600 border border-amber-100 group-hover/access:bg-amber-600 group-hover/access:text-white group-hover/access:border-amber-600"
                  }
                `}>
                  {isAlert ? (
                    <Plus size={16} strokeWidth={3} />
                  ) : (
                    <Pencil size={14} strokeWidth={2.5} />
                  )}
                </div>
              </div>
            </ContentAccessDialog>
          );
        }

        // 共通・非公開は従来通り（クリック不可）
        return (
          <div className="flex flex-col gap-1.5 min-w-[140px]">
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border w-fit ${styles.bg} ${styles.border}`}>
              <span className="opacity-70">{styles.icon}</span>
              <span className={`text-[10px] font-black tracking-tight ${styles.text}`}>
                {config?.label}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      id: "tags",
      header: t('tagsHeader'),
      cell: ({ row }) => {
        // row.original は Content 型
        const content = row.original;
      
        return (
          <div className="flex items-center gap-2 flex-wrap max-w-[250px]">
            {/* content を丸ごと渡すことで、内部で content_id や現在の tags を参照可能
            */}
            <ContentTagDialog content={content} />
          </div>
        );
      },
    },
    {
      id: "actions",
      header: () => <div className="text-right px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('actionsHeader')}</div>,
      cell: ({ row }) => {
        const editorLabelKey = EDITOR_LABEL_KEYS[row.original.content_type];
        const { icon: TypeIcon, theme } = getContentTypeConfig(row.original.content_type);
        return (
          <div className="flex justify-end items-center gap-3 px-2">
            {/* 教材基本情報の編集モーダル */}
            <ContentFormDialog mode="edit" initialData={row.original} />

            {/* 中身（単語・問題・セッション）のエディタ画面へ。未対応種別は列を揃えるため空枠を置く */}
            {editorLabelKey ? (
              <Button variant="outline" size="sm" asChild className={`h-8 min-w-38 justify-between gap-2 px-3 font-bold text-xs shadow-sm transition-colors ${theme.chip} ${theme.chipHover}`}>
                <Link href={getEditorHref(row.original)}>
                  <span className="flex items-center gap-1.5">
                    <TypeIcon size={13} />
                    {t(`editorButton.${editorLabelKey}`)}
                  </span>
                  <ArrowRight size={13} />
                </Link>
              </Button>
            ) : (
              <div className="min-w-38" aria-hidden />
            )}
          </div>
        );
      },
    },
  ];
}
