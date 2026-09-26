import { ShellPageHeader } from '@/components/shell/ShellPage';
import { CalendarBoard } from './_components/CalendarBoard';

export default function CalendarPage() {
  return (
    <>
      <ShellPageHeader
        title="カレンダー"
        back="/live-room"
        description="個別セッションやグループセッション、お知らせなどの予定をまとめて確認できます。"
      />

      <CalendarBoard />
    </>
  );
}
