// apps/student/app/(app)/(shell)/favorites/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';

export default function FavoritesLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width="wide">{children}</ContentFrame>;
}
