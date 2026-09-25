// apps/student/app/(app)/training/layout.tsx
import { PanelFrame } from '@/components/shell/PageFrames';

export default function TrainingLayout({ children }: { children: React.ReactNode }) {
  return <PanelFrame fullScreen>{children}</PanelFrame>;
}
