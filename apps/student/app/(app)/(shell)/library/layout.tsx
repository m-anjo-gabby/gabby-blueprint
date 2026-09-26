// apps/student/app/(app)/(shell)/library/layout.tsx
import { ContentFrame } from '@/components/shell/PageFrames';

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return <ContentFrame width="wide">{children}</ContentFrame>;
}
