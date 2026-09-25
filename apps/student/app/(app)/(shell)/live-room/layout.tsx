// apps/student/app/(app)/(shell)/live-room/layout.tsx
import { PanelFrame } from '@/components/shell/PageFrames';

export default function LiveSessionHubLayout({ children }: { children: React.ReactNode }) {
  return <PanelFrame>{children}</PanelFrame>;
}
