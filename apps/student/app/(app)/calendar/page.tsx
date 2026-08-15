import { CalendarBoard } from './_components/CalendarBoard';

export default function CalendarPage() {
  return (
    <div className="max-w-2xl mx-auto px-2 py-10 space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-black text-slate-800 tracking-tight">マイレッスン</h1>
        <p className="text-[13px] text-slate-500">
          予定されているレッスンの確認・キャンセル・振替ができます。
        </p>
      </div>

      <CalendarBoard />
    </div>
  );
}
