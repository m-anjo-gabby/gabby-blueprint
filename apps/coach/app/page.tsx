import { redirect } from 'next/navigation';

// proxy.ts が常にルートパスを振り分けるため、通常はこの実装に到達しません（保険用のフォールバック）
export default function Home() {
  redirect('/dashboard');
}
