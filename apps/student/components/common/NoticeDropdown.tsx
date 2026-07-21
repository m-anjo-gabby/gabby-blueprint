'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ChevronRight, BellOff, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Popover from '@radix-ui/react-popover';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useNoticeStore } from '@/stores/useNoticeStore';
import { NOTICE_TYPES, NoticeType } from '@gabby/types/notice';

// ─── 種別バッジカラーマップ ───────────────────────────────
const TYPE_BADGE_CLASS: Record<string, string> = {
  INFO:        'bg-blue-50  text-blue-600  border-blue-100',
  CAMPAIGN:    'bg-orange-50 text-orange-600 border-orange-100',
  MAINTENANCE: 'bg-red-50   text-red-600   border-red-100',
  UPDATE:      'bg-violet-50 text-violet-600 border-violet-100',
};

// ─── 未読ドット ───────────────────────────────────────────
const UnreadDot = () => (
  <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1" />
);

export function NoticeDropdown() {
  const router = useRouter();
  const { notices, unreadCount, isLoading, fetchNotices, markAsRead } = useNoticeStore();
  // open を明示的に管理することで、close 後に確実に navigate できるようにする
  const [open, setOpen] = useState(false);

  // マウント時に取得（キャッシュがあればスキップ）
  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  /**
   * ポップオーバーを閉じてからページ遷移する。
   * Radix Popover.Close asChild と router.push を同時に使うと、
   * Close の onPointerDown がフォーカスを奪い push が無効化されるケースがある。
   * 明示的に close → navigate の順で実行する。
   */
  const closeAndNavigate = useCallback(
    (href: string) => {
      setOpen(false);
      // close アニメーション完了を待ってから push（1フレーム待つだけで十分）
      requestAnimationFrame(() => {
        router.push(href);
      });
    },
    [router]
  );

  const handleNoticeClick = useCallback(
    async (noticeId: string, isRead: boolean) => {
      if (!isRead) {
        // 既読化は非同期で行い、ナビゲーションをブロックしない
        markAsRead(noticeId);
      }
      closeAndNavigate(`/notice?focus=${noticeId}`);
    },
    [markAsRead, closeAndNavigate]
  );

  // 最新5件をプレビュー
  const previewNotices = notices.slice(0, 5);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {/* ベルアイコンボタン */}
        <button
          id="notice-bell-button"
          aria-label="お知らせ"
          className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-slate-100 active:scale-90 transition-all outline-none"
        >
          <Bell size={18} className="text-slate-500" />
          {/* 未読バッジ */}
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                key="badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black leading-none shadow-sm"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-[200] w-80 sm:w-96 bg-white rounded-[24px] shadow-2xl border border-slate-100 overflow-hidden outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {/* ─── ヘッダー ──────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-50">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-slate-500" />
                <span className="text-xs font-black text-slate-800 tracking-tight">
                  お知らせ
                </span>
                {unreadCount > 0 && (
                  <span className="text-[9px] font-black text-rose-500 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded-full">
                    {unreadCount} 未読
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => closeAndNavigate('/notice')}
                  className="flex items-center gap-0.5 text-[10px] font-black text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  すべて見る <ChevronRight size={11} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="w-6 h-6 rounded-full hover:bg-slate-100 flex items-center justify-center transition-all"
                  aria-label="閉じる"
                >
                  <X size={12} className="text-slate-400" />
                </button>
              </div>
            </div>

            {/* ─── リスト ──────────────────────────────────────── */}
            <div className="max-h-[340px] overflow-y-auto">
              {isLoading ? (
                // スケルトン
                <div className="p-3 space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-14 bg-slate-50 rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : previewNotices.length === 0 ? (
                // エンプティステート
                <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                  <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-3">
                    <BellOff size={18} />
                  </div>
                  <p className="text-xs font-bold text-slate-400">お知らせはありません</p>
                  <p className="text-[10px] text-slate-300 mt-1 font-black uppercase tracking-wider">
                    No notifications
                  </p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {previewNotices.map(notice => (
                    <button
                      key={notice.notice_id}
                      id={`notice-item-${notice.notice_id}`}
                      onClick={() => handleNoticeClick(notice.notice_id, notice.is_read)}
                      className={cn(
                        'w-full text-left flex items-start gap-2.5 p-3 rounded-2xl transition-all hover:bg-slate-50 active:scale-[0.98]',
                        !notice.is_read && 'bg-indigo-50/50'
                      )}
                    >
                      {/* 未読ドット */}
                      <div className="mt-1">
                        {!notice.is_read ? (
                          <UnreadDot />
                        ) : (
                          <span className="inline-block w-1.5 h-1.5 shrink-0" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* バッジ行 */}
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          <span
                            className={cn(
                              'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border',
                              TYPE_BADGE_CLASS[notice.notice_type] ?? TYPE_BADGE_CLASS['INFO']
                            )}
                          >
                            {NOTICE_TYPES[notice.notice_type as NoticeType]?.label ?? notice.notice_type}
                          </span>
                          {notice.is_important && (
                            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-100">
                              ⚠ Important
                            </span>
                          )}
                        </div>

                        {/* タイトル */}
                        <p
                          className={cn(
                            'text-xs font-bold text-slate-700 truncate leading-snug',
                            !notice.is_read && 'text-slate-900 font-black'
                          )}
                        >
                          {notice.title}
                        </p>

                        {/* 日時 */}
                        <p className="text-[10px] text-slate-400 mt-0.5 font-bold">
                          {format(new Date(notice.published_at), 'yyyy/MM/dd', { locale: ja })}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ─── フッター（お知らせが存在する場合のみ） ────── */}
            {previewNotices.length > 0 && (
              <div className="px-4 pb-4 pt-2 border-t border-slate-50">
                <button
                  onClick={() => closeAndNavigate('/notice')}
                  className="w-full h-9 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                >
                  View All Notices
                </button>
              </div>
            )}
          </motion.div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
