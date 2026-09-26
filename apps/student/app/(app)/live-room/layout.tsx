// apps/student/app/(app)/live-room/layout.tsx
import { PanelFrame } from '@/components/shell/PageFrames';

export default function LiveRoomLayout({ children }: { children: React.ReactNode }) {
  return <PanelFrame>{children}</PanelFrame>;
}
