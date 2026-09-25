// apps/student/app/(app)/(shell)/favorites/layout.tsx
import { PanelFrame } from '@/components/shell/PageFrames';

export default function FavoritesLayout({ children }: { children: React.ReactNode }) {
  return <PanelFrame>{children}</PanelFrame>;
}
