'use client';

import Link from 'next/link';
import { ArrowRight, Video } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { SessionListItem } from '@gabby/types/session';

const JOINABLE_WINDOW_MS = 48 * 60 * 60 * 1000;

function isJoinableSoon(startDatetime: string): boolean {
  return new Date(startDatetime).getTime() - Date.now() <= JOINABLE_WINDOW_MS;
}

interface NextSessionCardProps {
  session: SessionListItem;
}

/**
 * ライブセッション付き契約保持者向けの「次回セッション」ミニカード。
 * 予約管理(振替・キャンセル等)は持たず、ライブセッションハブへの導線のみを担う。
 */
export const NextSessionCard = ({ session }: NextSessionCardProps) => {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const href = isJoinableSoon(session.start_datetime) ? `/live-room/${session.session_id}` : '/live-room';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Link
        href={href}
        className="group flex items-center gap-3.5 p-4 bg-white border-2 border-rose-100 rounded-[28px] shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
      >
        <div className="w-11 h-11 rounded-full bg-rose-50 flex items-center justify-center text-rose-400 shrink-0">
          <Video size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black tracking-wider text-rose-500 uppercase">Next Session</p>
          <p className="text-sm font-black text-slate-800 truncate mt-0.5">{session.counterpart_name} コーチ</p>
          <p className="text-xs text-slate-500 mt-0.5">{formatDateTimeByZone(session.start_datetime, timezone, false)}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-rose-50 group-hover:text-rose-600 transition-all shrink-0">
          <ArrowRight size={15} strokeWidth={2.5} />
        </div>
      </Link>
    </motion.div>
  );
};
