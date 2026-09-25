// apps/student/app/(app)/(shell)/notice/layout.tsx
import { PanelFrame } from '@/components/shell/PageFrames';

export default function NoticeLayout({ children }: { children: React.ReactNode }) {
  return <PanelFrame>{children}</PanelFrame>;
}
