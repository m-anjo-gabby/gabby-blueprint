// components/common/TermsAgreementModal.tsx
"use client";

import React, { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Tabs from "@radix-ui/react-tabs";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
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
  pendingTerms: TermItem[];
}

export const TermsAgreementModal = ({ userId, pendingTerms }: Props) => {
  const [contents, setContents] = useState<Record<string, string>>({});
  const [readTerms, setReadTerms] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabase = createBrowserClient();

  // 1. StorageからMarkdownをfetch
  useEffect(() => {
    const fetchContents = async () => {
      const newContents: Record<string, string> = {};
      for (const term of pendingTerms) {
        try {
          const { data } = supabase.storage.from("terms").getPublicUrl(term.storage_path);
          console.log(`storage path: ${term.storage_path}`)
          const res = await fetch(data.publicUrl);
          if (!res.ok) throw new Error("Fetch failed");
          newContents[term.term_id] = await res.text();
        } catch (e) {
          newContents[term.term_id] = "規約の読み込みに失敗しました。";
        }
      }
      setContents(newContents);
    };
    fetchContents();
  }, [pendingTerms, supabase]);

  const allRead = pendingTerms.every((t) => readTerms[t.term_id]);

  const handleScroll = (termId: string, e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    // 下端から20px程度で読了判定（余裕を持たせる）
    const isBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 20;
    if (isBottom && !readTerms[termId]) {
      setReadTerms((prev) => ({ ...prev, [termId]: true }));
    }
  };

  const handleAgree = async () => {
    if (!allRead || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await agreeToTerms(userId, pendingTerms.map(t => t.term_id));
    } catch (e) {
      alert("同意処理に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={true}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-[100] animate-in fade-in" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-[101] w-[95vw] max-w-2xl translate-x-[-50%] translate-y-[-50%] outline-none">
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200"
          >
            <div className="p-6 border-b bg-white">
              <Dialog.Title className="text-xl font-bold text-slate-800 flex items-center gap-2">
                重要なお知らせ
              </Dialog.Title>
              <p className="text-sm text-slate-500 mt-1">
                サービスの継続利用には、以下の規約への同意が必要です。
              </p>
            </div>

            <Tabs.Root defaultValue={pendingTerms[0].term_id}>
              <Tabs.List className="flex bg-slate-50 border-b px-2">
                {pendingTerms.map((term) => (
                  <Tabs.Trigger
                    key={term.term_id}
                    value={term.term_id}
                    className="px-6 py-3 text-sm font-medium transition-all border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 text-slate-500 hover:text-slate-700"
                  >
                    <span className="flex items-center gap-2">
                      {term.term_type === "TERMS" ? "利用規約" : "プライバシー"}
                      {readTerms[term.term_id] && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                    </span>
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              {pendingTerms.map((term) => (
                <Tabs.Content key={term.term_id} value={term.term_id}>
                  <ScrollArea.Root className="h-[50vh] w-full">
                    <ScrollArea.Viewport 
                      className="h-full w-full p-8" 
                      onScroll={(e) => handleScroll(term.term_id, e)}
                    >
                      <article className="prose prose-slate prose-blue max-w-none prose-sm sm:prose-base">
                        {contents[term.term_id] ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {contents[term.term_id]}
                          </ReactMarkdown>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-32 gap-3 text-slate-400">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <p className="text-xs">規約を取得中...</p>
                          </div>
                        )}
                      </article>
                    </ScrollArea.Viewport>
                    <ScrollArea.Scrollbar className="w-2 bg-slate-100" orientation="vertical">
                      <ScrollArea.Thumb className="bg-slate-300 rounded-full" />
                    </ScrollArea.Scrollbar>
                  </ScrollArea.Root>
                </Tabs.Content>
              ))}
            </Tabs.Root>

            <div className="p-6 bg-slate-50 border-t flex flex-col gap-4">
              {!allRead && (
                <div className="flex items-center gap-3 text-blue-700 text-xs bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>各タブの規約を最後までスクロールして確認してください。</span>
                </div>
              )}
              
              <button
                onClick={handleAgree}
                disabled={!allRead || isSubmitting}
                className={cn(
                  "w-full py-3.5 rounded-xl font-bold text-white transition-all shadow-md active:scale-95",
                  allRead && !isSubmitting 
                    ? "bg-blue-600 hover:bg-blue-700 cursor-pointer" 
                    : "bg-slate-300 cursor-not-allowed shadow-none"
                )}
              >
                {isSubmitting ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  allRead ? "同意して利用を開始する" : "内容を確認してください"
                )}
              </button>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};