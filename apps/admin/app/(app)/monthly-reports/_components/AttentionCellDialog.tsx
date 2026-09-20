'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MonthlyReportSession } from '@gabby/types/monthlyReport';
import { sessionStatusLabel } from './sessionStatusLabel';

export interface AttentionCellDetail {
  userName: string;
  dateKey: string; // "YYYY-MM-DD"
  sessions: MonthlyReportSession[];
}

function formatTimeRange(session: MonthlyReportSession, locale: string): string {
  const formatter = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ja-JP', { hour: '2-digit', minute: '2-digit' });
  return `${formatter.format(new Date(session.start_datetime))} 〜 ${formatter.format(new Date(session.end_datetime))}`;
}

export function AttentionCellDialog({
  detail,
  onClose,
}: {
  detail: AttentionCellDetail | null;
  onClose: () => void;
}) {
  const t = useTranslations('monthlyReports.status');
  const locale = useLocale();
  return (
    <Dialog open={detail !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {detail && (
          <>
            <DialogHeader>
              <DialogTitle>{detail.userName}</DialogTitle>
              <p className="text-xs text-slate-500">{detail.dateKey}</p>
            </DialogHeader>

            <div className="space-y-2">
              {detail.sessions.map((session) => (
                <div
                  key={session.session_id}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <p className="font-medium text-slate-800">{formatTimeRange(session, locale)}</p>
                  <p className="text-xs text-slate-500">{sessionStatusLabel(session, t)}</p>
                  {session.status_note && (
                    <p className="text-xs text-slate-400 mt-0.5">{session.status_note}</p>
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
