// apps/student/app/(app)/chat/layout.tsx
import { PanelFrame } from '@/components/shell/PageFrames';

export default function ChatRoomLayout({ children }: { children: React.ReactNode }) {
  return <PanelFrame>{children}</PanelFrame>;
}
