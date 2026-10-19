// apps/student/app/(app)/(shell)/favorites/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';
import { TrainingSectionNav } from '@/components/shell/TrainingSectionNav';
import { SHELL_CONTENT_WIDTH } from '@/constants/shellLayout';

export default function FavoritesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ContentFrame width={SHELL_CONTENT_WIDTH.favorites}>
      <TrainingSectionNav />
      {children}
    </ContentFrame>
  );
}
