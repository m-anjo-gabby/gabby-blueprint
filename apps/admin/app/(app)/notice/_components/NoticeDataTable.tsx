// apps/admin/app/(app)/notice/_components/NoticeDataTable.tsx
'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  Bell, 
  FileText, 
  Paperclip, 
  Globe,
  Building2,
  Users,
  CheckCircle2,
  Clock,
  EyeOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { deleteNotice } from '@/actions/adminNoticeAction';
import { useToast } from '@gabby/lib/hooks/useToast';
import { NOTICE_TYPES, NOTICE_IMPORTANT_BADGE, NoticeType } from '@gabby/types/notice';
import { formatToJstDateTime } from '@gabby/lib/date/date';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface NoticeItemData {
  notice_id: string;
  target_type: 'ALL' | 'CLIENT' | 'COACH';
  client_id: string | null;
  client_name?: string | null;
  notice_type: NoticeType;
  is_important: boolean;
  show_dialog: boolean;
  title: string;
  content: string;
  attachments: any[];
  published_at: string;
  expired_at: string | null;
  is_published: boolean;
  insert_date: string;
}

interface NoticeDataTableProps {
  data: NoticeItemData[];
  pageCount: number;
  totalCount: number;
}

export function NoticeDataTable({ data, pageCount, totalCount }: NoticeDataTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentPage = Number(searchParams.get('page')) || 1;
  const currentSearch = searchParams.get('q') || '';
  const currentType = searchParams.get('type') || 'ALL';

  const updateQueryParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (key !== 'page') {
      params.set('page', '1');
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      setIsDeleting(true);
      const res = await deleteNotice(deleteId);
      if (res.success) {
        showToast('お知らせを削除しました', 'success');
      } else {
        showToast(res.message || '削除に失敗しました', 'error');
      }
    } catch (e) {
      showToast('削除中にエラーが発生しました', 'error');
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  // 公開ステータス判定（現在時刻と published_at / expired_at / is_published）
  const getPublishStatusBadge = (notice: NoticeItemData) => {
    if (!notice.is_published) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
          <EyeOff size={10} /> 下書き
        </span>
      );
    }

    const now = new Date();
    const pubDate = new Date(notice.published_at);
    const expDate = notice.expired_at ? new Date(notice.expired_at) : null;

    if (pubDate > now) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          <Clock size={10} /> 予約公開
        </span>
      );
    }

    if (expDate && expDate < now) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
          終了
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 size={10} /> 公開中
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* ─── 検索 & フィルターバー ───────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* キーワード検索 */}
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="タイトルで検索..."
              defaultValue={currentSearch}
              onChange={(e) => updateQueryParams('q', e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
            />
          </div>

          {/* 種別フィルター */}
          <select
            value={currentType}
            onChange={(e) => updateQueryParams('type', e.target.value)}
            className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
          >
            <option value="ALL">すべての種別</option>
            {Object.entries(NOTICE_TYPES).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>
        </div>

        {/* 新規登録ボタン */}
        <Link
          href="/notice/new"
          className="w-full sm:w-auto h-10 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
        >
          <Plus size={16} />
          新規お知らせ作成
        </Link>
      </div>

      {/* ─── テーブル ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="py-3.5 px-4 min-w-[240px]">タイトル</th>
                <th className="py-3.5 px-4 min-w-[120px]">種別</th>
                <th className="py-3.5 px-4 min-w-[130px]">対象</th>
                <th className="py-3.5 px-4 min-w-[100px]">ステータス</th>
                <th className="py-3.5 px-4 min-w-[150px]">公開日時 (JST)</th>
                <th className="py-3.5 px-4 min-w-[150px]">終了日時 (JST)</th>
                <th className="py-3.5 px-4 text-right min-w-[100px]">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-bold">
                    お知らせが見つかりません
                  </td>
                </tr>
              ) : (
                data.map((notice) => (
                  <tr key={notice.notice_id} className="hover:bg-slate-50/60 transition-colors">
                    {/* タイトル */}
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/notice/${notice.notice_id}/edit`}
                            className="font-black text-slate-800 hover:text-indigo-600 transition-colors leading-snug line-clamp-1"
                          >
                            {notice.title}
                          </Link>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {notice.is_important && (
                            <span className={cn('text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border', NOTICE_IMPORTANT_BADGE.badgeClass)}>
                              {NOTICE_IMPORTANT_BADGE.label}
                            </span>
                          )}
                          {notice.show_dialog && (
                            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                              ポップアップ
                            </span>
                          )}
                          {notice.attachments && notice.attachments.length > 0 && (
                            <span className="text-[9px] font-black text-slate-400 flex items-center gap-0.5">
                              <Paperclip size={10} />
                              {notice.attachments.length}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 種別 */}
                    <td className="py-4 px-4">
                      <span className={cn(
                        'text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border inline-block',
                        NOTICE_TYPES[notice.notice_type]?.badgeClass ?? NOTICE_TYPES.INFO.badgeClass
                      )}>
                        {NOTICE_TYPES[notice.notice_type]?.label ?? notice.notice_type}
                      </span>
                    </td>

                    {/* 対象 */}
                    <td className="py-4 px-4">
                      {notice.target_type === 'ALL' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600">
                          <Globe size={13} className="text-slate-400" /> 生徒全体配信
                        </span>
                      ) : notice.target_type === 'COACH' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                          <Users size={13} className="text-emerald-500" /> コーチ一括配信
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600">
                          <Building2 size={13} className="text-indigo-500" />
                          {notice.client_name || '顧客指定'}
                        </span>
                      )}
                    </td>

                    {/* ステータス */}
                    <td className="py-4 px-4">
                      {getPublishStatusBadge(notice)}
                    </td>

                    {/* 公開日時 */}
                    <td className="py-4 px-4 font-mono text-[11px] text-slate-600">
                      {formatToJstDateTime(notice.published_at)}
                    </td>

                    {/* 終了日時 */}
                    <td className="py-4 px-4 font-mono text-[11px] text-slate-600">
                      {notice.expired_at ? formatToJstDateTime(notice.expired_at) : <span className="text-slate-400">無期限</span>}
                    </td>

                    {/* 操作 */}
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/notice/${notice.notice_id}/edit`}
                          className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-95"
                          title="編集"
                        >
                          <Edit3 size={15} />
                        </Link>
                        <button
                          onClick={() => setDeleteId(notice.notice_id)}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all active:scale-95"
                          title="削除"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ─── ページネーション ─────────────────────────────── */}
        {pageCount > 1 && (
          <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500">
              全 {totalCount} 件中 {data.length} 件表示
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => updateQueryParams('page', String(currentPage - 1))}
                className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-mono font-bold text-slate-600 px-2">
                {currentPage} / {pageCount}
              </span>
              <button
                disabled={currentPage >= pageCount}
                onClick={() => updateQueryParams('page', String(currentPage + 1))}
                className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── 削除確認モーダル ─────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="rounded-3xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-black text-slate-900">
              お知らせを削除しますか？
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500 font-bold leading-relaxed">
              この操作を取り消すことはできません。このお知らせはユーザー画面から削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl font-bold text-xs h-10">
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-xl font-bold text-xs h-10 bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isDeleting ? '削除中...' : '削除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
