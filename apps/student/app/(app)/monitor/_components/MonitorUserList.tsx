'use client';

import React, { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MonitorUser } from '@/actions/monitorAction';
import { cn } from '@/lib/utils';
import { User, Mail, Calendar, Clock, CheckCircle2, XCircle, Hourglass, Ban } from 'lucide-react';

interface MonitorUserListProps {
  users: MonitorUser[];
}

export const MonitorUserList: React.FC<MonitorUserListProps> = ({ users }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSelectedUserIds = searchParams.get('userIds')?.split(',') || [];

  const handleSelectUser = useCallback((userId: string) => {
    const newSearchParams = new URLSearchParams(searchParams.toString());
    const newSelectedUserIds = currentSelectedUserIds.includes(userId)
      ? currentSelectedUserIds.filter(id => id !== userId)
      : [...currentSelectedUserIds, userId];

    if (newSelectedUserIds.length > 0) newSearchParams.set('userIds', newSelectedUserIds.join(','));
    else newSearchParams.delete('userIds');

    router.replace(`/monitor?${newSearchParams.toString()}`);
  }, [currentSelectedUserIds, searchParams, router]);

  const getLicenseStateBadge = (state: MonitorUser['license_state']) => {
    switch (state) {
      case 'active':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"><CheckCircle2 size={12} /> Active</span>;
      case 'expired':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle size={12} /> Expired</span>;
      case 'future':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><Hourglass size={12} /> Future</span>;
      case 'inviting':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><Mail size={12} /> Invited</span>;
      case 'expired_invite':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"><Ban size={12} /> Invite Expired</span>;
      case 'mail_failed':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800"><XCircle size={12} /> Mail Failed</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">N/A</span>;
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-5 space-y-4">
      <h2 className="text-lg font-bold text-slate-800">受講生一覧</h2>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {users.length === 0 ? (
          <p className="text-sm text-slate-500">該当するユーザーがいません。</p>
        ) : (
          users.map(user => (
            <button
              key={user.id}
              onClick={() => handleSelectUser(user.id)}
              className={cn(
                "w-full p-3 flex items-center justify-between rounded-xl border transition-all",
                currentSelectedUserIds.includes(user.id)
                  ? "bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200"
                  : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              <div className="flex items-center gap-3 text-left">
                <div className="w-8 h-8 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center shrink-0">
                  <User size={16} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{user.user_name || '名無し'}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {getLicenseStateBadge(user.license_state)}
                {user.last_sign_in_at && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Clock size={10} />
                    最終ログイン: {new Date(user.last_sign_in_at).toLocaleDateString('ja-JP')}
                  </span>
                )}
                {user.insert_date && !user.last_sign_in_at && (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Calendar size={10} />
                    招待日: {new Date(user.insert_date).toLocaleDateString('ja-JP')}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};