// apps/student/app/(app)/(shell)/library/layout.tsx
import { PanelFrame } from '@/components/shell/PageFrames';

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return <PanelFrame>{children}</PanelFrame>;
}
