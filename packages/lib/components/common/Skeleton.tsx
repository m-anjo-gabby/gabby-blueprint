import { cn } from '../../utils';

/**
 * 読み込み中の骨組み（全アプリ共通の最小部品）。
 * 形・大きさは className で指定する。面色は brand-theme.css の skeleton トークン。
 */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-skeleton', className)} {...props} />;
}
