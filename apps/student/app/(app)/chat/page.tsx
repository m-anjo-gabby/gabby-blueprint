import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ChatRoomList } from './_components/ChatRoomList';

export default function ChatPage() {
  return (
    <div className="flex flex-col w-full max-w-2xl h-full bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
      <header className="px-5 sm:px-8 pt-6 sm:pt-8 pb-6 border-b border-slate-50 space-y-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="p-2 -ml-2 hover:bg-slate-100 rounded-2xl transition-all active:scale-90 text-slate-400 shrink-0"
          >
            <ChevronLeft size={24} />
          </Link>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">チャット</h1>
        </div>

        <p className="text-[13px] text-slate-500">担当コーチや運営とのメッセージをまとめて確認できます。</p>
      </header>

      <div className="flex-1 min-h-0 flex flex-col bg-slate-50/50">
        <ChatRoomList />
      </div>
    </div>
  );
}
