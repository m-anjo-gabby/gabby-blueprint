import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getSessionResultSummary } from '@/actions/sessionAction';
import { CardSkeleton } from '@gabby/lib/components/common/PageSkeleton';
import { SessionHub } from './_components/SessionHub';
import { HubDialoguePractice, HubPrep, HubSelfTraining } from './_components/HubSections';

/**
 * セッション準備/実施ハブ。生徒概要画面から個別のライブセッションに入るとまずここに来る。
 * 通話開始・Live Sprint開始・セッション終了(finalize_session)の3操作をここに集約する
 * （生徒概要画面から各機能へ直接飛ぶ導線は廃止し、必ずここを経由する）。
 * このセッション自体の実施記録（入退室ログ・チャット履歴・スプリント履歴）はセッション結果画面
 * （.../result）が担うため、ここでは重複させず、通話前後に確認したい「前回までの状況」
 * （前回の宿題・前回のLive Sprint・直近1週間の自主トレ状況）を画面遷移なしで見せることに絞る。
 */
export default async function SessionHubPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;

  // 通話開始・終了の操作に必要なセッション情報だけを先に確定させ、
  // 「前回までの状況」等の区画は Suspense で個別に後から表示する
  const sessionResult = await getSessionResultSummary(sessionId);

  if (!sessionResult.success) {
    notFound();
  }

  return (
    <SessionHub
      studentId={id}
      session={sessionResult.session}
      dialoguePractice={
        <Suspense fallback={<CardSkeleton />}>
          <HubDialoguePractice studentId={id} sessionId={sessionId} />
        </Suspense>
      }
      prep={
        <Suspense
          fallback={
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CardSkeleton rows={2} />
              <CardSkeleton rows={2} />
            </div>
          }
        >
          <HubPrep studentId={id} sessionId={sessionId} />
        </Suspense>
      }
      selfTraining={
        <Suspense fallback={<CardSkeleton rows={1} />}>
          <HubSelfTraining studentId={id} />
        </Suspense>
      }
    />
  );
}
