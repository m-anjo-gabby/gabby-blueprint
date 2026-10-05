'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { UserAvatar } from '@/components/common/UserAvatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MonthlyReportSession } from '@gabby/types/monthlyReport';
import { sessionStatusLabel } from './sessionStatusLabel';

export interface AttentionCellDetail {
  studentId: string;
  userName: string;
  iconPath: string | null;
  dateKey: string; // "YYYY-MM-DD"
  sessions: MonthlyReportSession[];
}

function formatTimeRange(session: MonthlyReportSession): string {
  const formatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${formatter.format(new Date(session.start_datetime))} - ${formatter.format(new Date(session.end_datetime))}`;
}

export function AttentionCellDialog({
  detail,
  onClose,
}: {
  detail: AttentionCellDetail | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={detail !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {detail && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <UserAvatar userName={detail.userName} iconPath={detail.iconPath} size={40} />
                <div>
                  <DialogTitle>{detail.userName}</DialogTitle>
                  <p className="text-xs text-slate-500">{detail.dateKey}</p>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-2">
              {detail.sessions.map((session) => (
                <div
                  key={session.session_id}
                  className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-800">{formatTimeRange(session)}</p>
                    <p className="text-xs text-slate-500">{sessionStatusLabel(session)}</p>
                    {session.status_note && (
                      <p className="text-xs text-slate-400 mt-0.5">{session.status_note}</p>
                    )}
                  </div>
                  {session.is_unresolved && (
                    <Link
                      href={`/students/${detail.studentId}/sessions/${session.session_id}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:text-brand-strong whitespace-nowrap"
                    >
                      Resolve <ArrowRight size={12} />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
