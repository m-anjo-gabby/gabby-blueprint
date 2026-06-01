"use client";

import React, { useEffect, useState, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Tabs from "@radix-ui/react-tabs";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, X, FileText, ShieldCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@gabby/lib/supabase/client";
import { agreeToTerms } from "@/actions/termAction";

interface TermItem {
  term_id: string;
  term_type: string;
  version_name: string;
  storage_path: string;
}

interface Props {
  userId: string;
  terms: TermItem[];
  mode?: 'agreement' | 'reference';
  pendingTerms?: TermItem[];
  onClose?: () => void;
  isOpen?: boolean;
}

// 💡 レンダー毎の新しい配列の生成を防ぐため、コンポーネント外で静的な空配列を定義
const EMPTY_ARRAY: TermItem[] = [];

export const TermsAgreementModal = ({ 
  userId, 
  terms: propsTerms, 
  pendingTerms, 
  mode = 'agreement', 
  onClose, 
  isOpen = true 
}: Props) => {
  const [contents, setContents] = useState<Record<string, string>>({});
  const [readTerms, setReadTerms] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = createBrowserClient();

  // 1. propsTerms または pendingTerms のいずれかが存在すればそれを使用。なければ静的な空配列を参照
  const terms = propsTerms || pendingTerms || EMPTY_ARRAY;

  // 2. termsの各ドキュメントのIDとパスを文字列としてシリアライズし、依存配列の比較を厳密化
  const termsKey = JSON.stringify(terms.map((t) => `${t.term_id}-${t.storage_path}`));

  useEffect(() => {
    // モーダルが閉じている、または規約データが存在しない場合は何もしない
    if (!isOpen || terms.length === 0) return;

    let isMounted = true; // 競合・アンマウント時のメモリリークを防ぐフラグ

    const fetchContents = async () => {
      const newContents: Record<string, string> = {};
      
      for (const term of terms) {
        try {
          const { data } = supabase.storage.from("terms").getPublicUrl(term.storage_path);
          const res = await fetch(data.publicUrl);
          if (!res.ok) throw new Error("Fetch failed");
          newContents[term.term_id] = await res.text();
        } catch (e) {
          console.error(`Failed to fetch term (${term.term_id}):`, e);
          newContents[term.term_id] = "規約の読み込みに失敗しました。時間をおいて再度お試しください。";
        }
      }

      // コンポーネントがまだ生存している場合のみStateを更新
      if (isMounted) {
        setContents(newContents);
      }
    };

    fetchContents();

    return () => {
      isMounted = false; // クリーンアップ時にフラグを倒す
    };
  }, [termsKey, isOpen, supabase]); // termsKey（文字列）をトリガーにすることで無限ローディングを完全に防止

  const isAgreementMode = mode === 'agreement';
  const allRead = useMemo(() => terms.length > 0 && terms.every((t) => readTerms[t.term_id]), [terms, readTerms]);

  const handleScroll = (termId: string, e: React.UIEvent<HTMLDivElement>) => {
    if (!isAgreementMode) return;

    const target = e.currentTarget;
    // 判定に少しのバッファ（20px）を持たせることでスクロール感知の精度を担保
    const isBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 20;
    if (isBottom && !readTerms[termId]) {
      setReadTerms((prev) => ({ ...prev, [termId]: true }));
    }
  };

  const handleAgree = async () => {
    if (!allRead || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await agreeToTerms(userId, terms.map(t => t.term_id));
    } catch (e) {
      alert("同意処理に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
      <Dialog.Portal>
        {/* 背景オーバーレイ */}
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[100] animate-in fade-in duration-300" />
        
        {/* モーダルコンテンツ本体 */}
        <Dialog.Content 
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed left-[50%] top-[50%] z-[101] w-[95vw] max-w-2xl translate-x-[-50%] translate-y-[-50%] outline-none"
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
          >
            {/* 💡 アクセシビリティ対応: スクリーンリーダー用タイトル */}
            <Dialog.Title className="sr-only">
              {isAgreementMode ? "規約への同意" : "リーガル情報"}
            </Dialog.Title>

            {/* termsのメタデータ自体がまだHeader等から届いていない場合の全体ローディング */}
            {terms.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-20 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <p className="text-xs font-bold tracking-widest uppercase text-slate-400 animate-pulse">
                  Loading Documents...
                </p>
              </div>
            ) : (
              <>
                {/* ヘッダーエリア */}
                <div className="p-8 pb-6 bg-white relative">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                          {isAgreementMode ? "Agreement Required" : "Legal Documents"}
                        </span>
                      </div>
                      <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                        {isAgreementMode ? "規約への同意" : "リーガル情報"}
                      </h2>
                    </div>
                    {!isAgreementMode && (
                      <button onClick={onClose} className="p-2 rounded-2xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-all active:scale-95">
                        <X size={20} />
                      </button>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-500 leading-relaxed">
                    {isAgreementMode 
                      ? "サービスの利用を継続するには、最新の規約をご確認の上、同意いただく必要があります。"
                      : "サービスの利用規約およびプライバシーポリシーをご確認いただけます。"}
                  </p>
                </div>

                {/* タブエリア */}
                <Tabs.Root defaultValue={terms[0]?.term_id} className="flex-1 flex flex-col min-h-0 w-full overflow-hidden">
                  <div className="px-8 mb-4">
                    <Tabs.List className="grid grid-cols-2 w-full h-12 bg-slate-100/50 rounded-2xl p-1.5 border border-slate-50">
                      {terms.map((term) => (
                        <Tabs.Trigger
                          key={term.term_id}
                          value={term.term_id}
                          className="rounded-xl font-black text-[10px] uppercase tracking-wider transition-all data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm text-slate-400 flex items-center justify-center gap-2 outline-none"
                        >
                          {term.term_type === "TERMS" ? <FileText size={14} /> : <ShieldCheck size={14} />}
                          {term.term_type === "TERMS" ? "利用規約" : "プライバシー"}
                          {isAgreementMode && readTerms[term.term_id] && (
                            <CheckCircle2 size={12} className="text-emerald-500" />
                          )}
                        </Tabs.Trigger>
                      ))}
                    </Tabs.List>
                  </div>

                  {/* 本文ドキュメント表示エリア */}
                  <div className="flex-1 min-h-0 bg-slate-50/50 border-y border-slate-100 flex flex-col overflow-hidden w-full min-w-0">
                    {terms.map((term) => (
                      <Tabs.Content 
                        key={term.term_id} 
                        value={term.term_id} 
                        className="h-full w-full min-w-0 outline-none data-[state=active]:flex flex-col overflow-hidden"
                      >
                        <ScrollArea.Root className="flex-1 w-full min-w-0 overflow-hidden flex flex-col">
                          <ScrollArea.Viewport
                            className="h-full w-full overflow-y-auto overscroll-contain" 
                            onScroll={(e) => handleScroll(term.term_id, e)}
                          >
                            <div className="px-8 py-10 w-full max-w-full min-w-0 break-words">
                              {/* 💡 Markdownテキスト自体の読み込み判定 */}
                              {contents[term.term_id] ? (
                                <article className="prose prose-indigo prose-sm sm:prose-base max-w-none prose-headings:font-black prose-headings:tracking-tight prose-strong:font-black break-words whitespace-pre-wrap [word-break:break-word]">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {contents[term.term_id]}
                                  </ReactMarkdown>
                                </article>
                              ) : (
                                /* 各ドキュメント単位のファイルフェッチ中ローディング */
                                <div className="flex flex-col items-center justify-center py-32 gap-4 text-slate-400">
                                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                                  <p className="text-xs font-bold tracking-widest uppercase animate-pulse">
                                    Fetching Document Content...
                                  </p>
                                </div>
                              )}
                            </div>
                          </ScrollArea.Viewport>
                          <ScrollArea.Scrollbar className="w-2.5 bg-slate-100/50" orientation="vertical">
                            <ScrollArea.Thumb className="bg-slate-200 rounded-full" />
                          </ScrollArea.Scrollbar>
                        </ScrollArea.Root>
                      </Tabs.Content>
                    ))}
                  </div>
                </Tabs.Root>

                {/* フッターアクションエリア */}
                <div className="p-8 bg-white flex flex-col gap-4">
                  {isAgreementMode ? (
                    <button
                      onClick={handleAgree}
                      disabled={!allRead || isSubmitting}
                      className={cn(
                        "w-full h-14 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-lg active:scale-[0.98] flex items-center justify-center",
                        allRead && !isSubmitting 
                          ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20" 
                          : "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none"
                      )}
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        allRead ? "同意して次へ進む" : "全項目を最下部までスクロールして確認"
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={onClose}
                      className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-slate-900/10 hover:bg-slate-800 transition-all active:scale-[0.98]"
                    >
                      Close
                    </button>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};