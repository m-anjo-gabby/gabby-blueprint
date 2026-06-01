"use client";

import React, { useEffect, useState, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Tabs from "@radix-ui/react-tabs";
import { motion } from "framer-motion";
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
  terms?: TermItem[];
  mode?: 'agreement' | 'reference';
  pendingTerms?: TermItem[];
  onClose?: () => void;
  isOpen?: boolean;
}

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

  const terms = propsTerms || pendingTerms || EMPTY_ARRAY;
  const isAgreementMode = mode === 'agreement';

  // 規約が1件のみの場合の判定
  const isSingleTerm = terms.length === 1;
  const singleTerm = terms[0];

  const termsKey = JSON.stringify(terms.map((t) => `${t.term_id}-${t.storage_path}`));

  useEffect(() => {
    if (!isOpen || terms.length === 0) return;

    let isMounted = true;

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
          newContents[term.term_id] = "規約の読み込みに失敗しました。お手数ですが時間をおいて再度お試しください。";
        }
      }

      if (isMounted) {
        setContents(newContents);
      }
    };

    fetchContents();

    return () => {
      isMounted = false;
    };
  }, [termsKey, isOpen, supabase]);

  const allRead = useMemo(() => terms.length > 0 && terms.every((t) => readTerms[t.term_id]), [terms, readTerms]);

  const handleScroll = (termId: string, e: React.UIEvent<HTMLDivElement>) => {
    if (!isAgreementMode) return;

    const target = e.currentTarget;
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
      alert("同意処理に失敗しました。通信環境の良い場所で再度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ヘッダータイトル・サブテキストの最適化ロジック
  const { badgeText, titleText, subText } = useMemo(() => {
    if (isAgreementMode) {
      return {
        badgeText: "Gabby Academy Legal",
        titleText: isSingleTerm 
          ? (singleTerm.term_type === "TERMS" ? "利用規約への同意" : "プライバシーポリシーへの同意")
          : "利用規約・ポリシーへの同意",
        subText: isSingleTerm
          ? "安心してサービスをご利用いただくために、新しく更新された内容をご確認の上、同意をお願いいたします。"
          : "安心してサービスをご利用いただくために、最新の利用規約および個人情報保護方針をご確認の上、同意をお願いいたします。"
      };
    } else {
      return {
        badgeText: "Reference Documents",
        titleText: isSingleTerm
          ? (singleTerm.term_type === "TERMS" ? "利用規約" : "プライバシーポリシー")
          : "リーガル情報・規定一覧",
        subText: "現在施行されている本サービスの各種規定をご確認いただけます。"
      };
    }
  }, [isAgreementMode, isSingleTerm, singleTerm]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[100] animate-in fade-in duration-300" />
        
        <Dialog.Content 
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed left-[50%] top-[50%] z-[101] w-[95vw] max-w-2xl translate-x-[-50%] translate-y-[-50%] outline-none"
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
          >
            <Dialog.Title className="sr-only">{titleText}</Dialog.Title>

            {terms.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-20 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <p className="text-xs font-bold tracking-widest uppercase text-slate-400 animate-pulse">
                  Loading Document...
                </p>
              </div>
            ) : (
              <>
                {/* ヘッダーエリア */}
                <div className="p-8 pb-6 bg-white relative">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex flex-col gap-3">
                      <div className="flex">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                          {badgeText}
                        </span>
                      </div>
                      <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                        {titleText}
                      </h2>
                    </div>
                    {!isAgreementMode && (
                      <button onClick={onClose} className="p-2 rounded-2xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-all active:scale-95">
                        <X size={20} />
                      </button>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-500 leading-relaxed max-w-xl">
                    {subText}
                  </p>
                </div>

                {/* タブおよび本文ドキュメント表示エリア */}
                <Tabs.Root defaultValue={terms[0]?.term_id} className="flex-1 flex flex-col min-h-0 w-full overflow-hidden">
                  
                  {/* termsが2件以上の時だけタブリストを表示 */}
                  {!isSingleTerm && (
                    <div className="px-8 mb-4">
                      <Tabs.List className="grid grid-cols-2 w-full h-12 bg-slate-100/50 rounded-2xl p-1.5 border border-slate-50">
                        {terms.map((term) => (
                          <Tabs.Trigger
                            key={term.term_id}
                            value={term.term_id}
                            className="rounded-xl font-black text-[10px] uppercase tracking-wider transition-all data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm text-slate-400 flex items-center justify-center gap-2 outline-none"
                          >
                            {term.term_type === "TERMS" ? <FileText size={14} /> : <ShieldCheck size={14} />}
                            {term.term_type === "TERMS" ? "利用規約" : "個人情報保護方針"}
                            {isAgreementMode && readTerms[term.term_id] && (
                              <CheckCircle2 size={12} className="text-emerald-500" />
                            )}
                          </Tabs.Trigger>
                        ))}
                      </Tabs.List>
                    </div>
                  )}

                  {/* 本文ドキュメント表示エリア */}
                  <div className="flex-1 min-h-0 bg-slate-50/50 border-y border-slate-100 flex flex-col overflow-hidden w-full min-w-0">
                    {terms.map((term) => (
                      <Tabs.Content 
                        key={term.term_id} 
                        value={term.term_id} 
                        className={cn(
                          "h-full w-full min-w-0 outline-none overflow-hidden",
                          isSingleTerm ? "flex flex-col" : "data-[state=active]:flex flex-col"
                        )}
                      >
                        <ScrollArea.Root className="flex-1 w-full min-w-0 overflow-hidden flex flex-col">
                          <ScrollArea.Viewport
                            className="h-full w-full overflow-y-auto overscroll-contain" 
                            onScroll={(e) => handleScroll(term.term_id, e)}
                          >
                            <div className="px-8 py-10 w-full max-w-full min-w-0 break-words">
                              {contents[term.term_id] ? (
                                /* 💡 変更: proseの一律指定クラス(prose-headings等)を取り除き、componentsにアドミン側と同一の上書きルールを適用 */
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
                                      // 💡 段落 (<p>) の改行制御を強制上書き。これで通常の改行が100%再現されます
                                      p: ({ node, ...props }) => (
                                        <p {...props} className="!whitespace-pre-wrap !leading-relaxed !text-slate-600 !my-4" />
                                      )
                                    }}
                                  >
                                    {contents[term.term_id]}
                                  </ReactMarkdown>
                                </article>
                              ) : (
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
                        allRead ? "同意して次へ進む" : "規約を最下部までスクロールして確認"
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={onClose}
                      className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-slate-900/10 hover:bg-slate-800 transition-all active:scale-[0.98]"
                    >
                      閉じる
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