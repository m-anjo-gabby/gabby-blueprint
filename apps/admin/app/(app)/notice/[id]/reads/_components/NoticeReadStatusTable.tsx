// apps/admin/app/(app)/notice/[id]/reads/_components/NoticeReadStatusTable.tsx
'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, CheckCircle2, CircleDashed, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getUserTypeLabel, USER_TYPES } from '@gabby/types/user';
import { formatToJstDateTime } from '@gabby/lib/date/date';
import type { NoticeReadStatusUser } from '@/actions/adminNoticeAction';

interface NoticeReadStatusTableProps {
  data: NoticeReadStatusUser[];
  pageCount: number;
  totalCount: number;
  readCount: number;
  unreadCount: number;
  clients: { client_id: string; client_name: string }[];
}

export function NoticeReadStatusTable({
  data,
  pageCount,
  totalCount,
  readCount,
  unreadCount,
  clients,
}: NoticeReadStatusTableProps) {
  const t = useTranslations('notice.readsTable');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPage = Number(searchParams.get('page')) || 1;
  const currentClientId = searchParams.get('clientId') || '';
  const currentUserType = searchParams.get('userType') || '';

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

  const readRate = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* ─── 集計サマリー ───────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('targetUsers')}</p>
          <p className="text-2xl font-black text-slate-800 mt-1">{totalCount}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{t('read')}</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">
            {readCount}
            <span className="text-xs font-bold text-slate-400 ml-1.5">({readRate}%)</span>
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('unread')}</p>
          <p className="text-2xl font-black text-slate-600 mt-1">{unreadCount}</p>
        </div>
      </div>

      {/* ─── フィルターバー & ページネーション ───────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <select
            value={currentClientId}
            onChange={(e) => updateQueryParams('clientId', e.target.value)}
            className="w-full sm:w-auto py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-brand-500 focus:bg-white transition-all"
          >
            <option value="">{t('allClients')}</option>
            {clients.map((c) => (
              <option key={c.client_id} value={c.client_id}>
                {c.client_name}
              </option>
            ))}
          </select>

          <select
            value={currentUserType}
            onChange={(e) => updateQueryParams('userType', e.target.value)}
            className="w-full sm:w-auto py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-brand-500 focus:bg-white transition-all"
          >
            <option value="">{t('allTypes')}</option>
            <option value={USER_TYPES.STUDENT}>{t('studentType')}</option>
            <option value={USER_TYPES.COACH}>{t('coachType')}</option>
          </select>
        </div>

        {/* ページネーション操作系 */}
        <div className="flex items-center gap-3 shrink-0">
          {totalCount > 0 && (
            <p className="hidden md:block text-xs font-bold text-slate-500 whitespace-nowrap">
              {t.rich('totalCount', {
                count: totalCount,
                styled: (chunks) => <span className="text-slate-900">{chunks}</span>,
              })}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => updateQueryParams('page', String(currentPage - 1))}
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-mono font-bold text-slate-600 px-2">
              {currentPage} / {pageCount || 1}
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
      </div>

      {/* ─── テーブル ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="py-3.5 px-4 min-w-50">{t('userHeader')}</th>
                <th className="py-3.5 px-4 min-w-40">{t('clientHeader')}</th>
                <th className="py-3.5 px-4 min-w-25">{t('typeHeader')}</th>
                <th className="py-3.5 px-4 min-w-25">{t('readStatusHeader')}</th>
                <th className="py-3.5 px-4 min-w-40">{t('readAtHeader')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 font-bold">
                    {t('noUsers')}
                  </td>
                </tr>
              ) : (
                data.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-4 text-slate-800">{user.user_name || t('unnamed')}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Building2 size={13} className="text-slate-300" />
                        <span className="font-medium">{user.client_name || t('noClient')}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={cn(
                          'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border',
                          user.user_type === USER_TYPES.STUDENT
                            ? 'text-brand border-brand-100 bg-brand-50/30'
                            : 'text-slate-500 border-slate-100 bg-slate-50'
                        )}
                      >
                        {getUserTypeLabel(user.user_type)}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      {user.is_read ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 size={10} /> {t('read')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                          <CircleDashed size={10} /> {t('unread')}
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 font-mono text-[11px] text-slate-600">
                      {user.read_at ? formatToJstDateTime(user.read_at) : <span className="text-slate-400">-</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
