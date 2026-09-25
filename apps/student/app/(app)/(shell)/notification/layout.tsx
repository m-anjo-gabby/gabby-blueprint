// apps/student/app/(app)/(shell)/notification/layout.tsx
import { PanelFrame } from '@/components/shell/PageFrames';

export default function NotificationLayout({ children }: { children: React.ReactNode }) {
  return <PanelFrame>{children}</PanelFrame>;
}
