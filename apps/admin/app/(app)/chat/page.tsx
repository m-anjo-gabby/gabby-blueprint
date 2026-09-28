// apps/admin/app/(app)/chat/page.tsx
import { getTranslations } from "next-intl/server";
import { ChatRoomList } from "./_components/ChatRoomList";

export default async function ChatPage() {
  const t = await getTranslations('chat.page');
  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">{t('title')}</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            {t('subtitle')}
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <ChatRoomList />
      </div>
    </div>
  );
}
