// apps/student/app/(app)/(shell)/chat/layout.tsx
import { PanelFrame } from '@/components/shell/PageFrames';

export default function ChatListLayout({ children }: { children: React.ReactNode }) {
  return <PanelFrame>{children}</PanelFrame>;
}
