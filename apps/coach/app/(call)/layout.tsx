import { createServerClient } from '@gabby/lib/supabase/server';
import { redirect } from 'next/navigation';
import ConfirmContainer from '@gabby/lib/components/common/ConfirmContainer';

/**
 * ライブセッション（ビデオ通話）専用レイアウト。
 * (app) レイアウトのHeader/Sidebarを持ち込まず、通話に特化した没入型の画面を
 * 別タブで開けるようにするための独立したルートグループ。
 * 認証ガードのみ (app) レイアウトと同様に踏襲する。
 */
export default async function CallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <>
      <div className="h-dvh w-full overflow-hidden bg-slate-950">
        {children}
      </div>
      <ConfirmContainer />
    </>
  );
}
