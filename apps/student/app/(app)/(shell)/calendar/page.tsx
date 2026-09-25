import { ShellPanel, ShellPanelHeader } from '@/components/shell/ShellPanel';
import { CalendarBoard } from './_components/CalendarBoard';

export default function CalendarPage() {
  return (
    <ShellPanel>
      <ShellPanelHeader
        title="カレンダー"
        back="/live-room"
        description="個別セッションやグループセッション、お知らせなどの予定をまとめて確認できます。"
      />

      <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 bg-canvas/60 space-y-6">
        <CalendarBoard />
      </div>
    </ShellPanel>
  );
}
