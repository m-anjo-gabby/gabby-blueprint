import Link from 'next/link';
import { ArrowLeft, BookOpen, History, Info, MessageCircle, MessagesSquare, TrendingUp, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Section } from '@/components/common/Section';
import { ImmersiveShell } from '@/components/common/ImmersiveShell';
import { ImmersiveHeader } from '@/components/common/ImmersiveHeader';
import { buildLiveSessionHubHref } from '@/lib/liveSession/context';

/*
 * ライブセッション関連の画面（セッションハブ・Live Sprint・Live Sprint Result・Session Result）の骨組み。
 * セッションハブ等は Header/Sidebar を覆う没入表示（ImmersiveShell）のため、骨組みも同じ没入表示で描く
 * （通常の枠の骨組みを挟むと、Header/Sidebar が一瞬現れて消えるちらつきになる）。
 * 見出し・区分・カードの見出しは本物を描き、データ部分だけを骨組みにする。各画面の構成を変えたら合わせて直す。
 */

/** カードの見出しは本物、本文は rows 行の骨組み */
function TitledCardSkeleton({ title, icon, rows = 2 }: { title: string; icon?: React.ReactNode; rows?: number }) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent aria-hidden className="pt-2 space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </CardContent>
    </Card>
  );
}

// ---------- Session Hub ----------

/** セッションハブの Dialogue Practice カードの骨組み（page.tsx の Suspense の fallback と共有） */
export function HubDialoguePracticeSkeleton() {
  return <TitledCardSkeleton title="Dialogue Practice" icon={<MessagesSquare size={14} className="text-slate-400" />} rows={2} />;
}

/** セッションハブの Prep 区画の骨組み（page.tsx の Suspense の fallback と共有） */
export function HubPrepSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <TitledCardSkeleton title="Last Live Sprint" rows={2} />
      <TitledCardSkeleton title="Last Homework" rows={2} />
    </div>
  );
}

/** セッションハブの Self-Training 区画の骨組み（見出しの日数はデータ依存のため骨組み） */
export function HubSelfTrainingSkeleton() {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent aria-hidden className="pt-2">
        <Skeleton className="h-16 w-full rounded-xl" />
      </CardContent>
    </Card>
  );
}

/**
 * セッションハブの骨組み。区分は「実施前（Training あり）」の並びで描く（ハブを開くのは多くが実施前・実施中のため）。
 */
export function SessionHubSkeleton({ studentId }: { studentId: string }) {
  return (
    <ImmersiveShell active className="flex flex-col">
      <ImmersiveHeader
        studentName={null}
        studentIconPath={null}
        title="Session Hub"
        backHref={`/students/${studentId}`}
        backLabel="Back to Overview"
        info={<Skeleton className="h-6 w-20 rounded-md" />}
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="max-w-5xl mx-auto space-y-8 pb-8">
          <p className="text-[13px] text-slate-500 max-w-2xl">
            Prep for this session, then click Start Live Session below to begin the call — it opens in a separate
            tab (or window), so you can keep this page open for training (e.g. Live Sprint) and prep info.
          </p>

          <Section label="Session Info" icon={Info}>
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent aria-hidden className="pt-5 space-y-4">
                <Skeleton className="h-6 w-20 rounded-md" />
                <Skeleton className="h-11 w-full rounded-xl" />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Skeleton className="h-9 w-40 rounded-full" />
                  <Skeleton className="h-9 w-32 rounded-full" />
                </div>
                <Skeleton className="h-3 w-56 max-w-full" />
              </CardContent>
            </Card>
          </Section>

          <Section label="Training">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TitledCardSkeleton title="Live Sprint" icon={<Zap size={14} className="fill-current text-amber-400" />} rows={1} />
              <HubDialoguePracticeSkeleton />
            </div>
          </Section>

          <Section label="Prep" icon={History}>
            <HubPrepSkeleton />
          </Section>

          <Section label="Self-Training" icon={TrendingUp}>
            <HubSelfTrainingSkeleton />
          </Section>
        </div>
      </div>
    </ImmersiveShell>
  );
}

// ---------- Live Sprint（Setup） ----------

/** Live Sprint の準備画面の骨組み（没入表示の中央のカード。見出し行と教材の選択肢を骨組み） */
export function LessonSprintSetupSkeleton() {
  return (
    <ImmersiveShell active className="flex items-center justify-center gap-4 p-2 overflow-hidden text-slate-900">
      <div
        aria-hidden
        className="bg-white border border-slate-100 w-full max-w-3xl h-full max-h-[95vh] rounded-[32px] flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="shrink-0 w-full px-6 pt-5 pb-3 border-b border-slate-100/60">
          <div className="flex items-center justify-between h-10">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex flex-col items-center gap-1.5">
              <Skeleton className="h-4 w-28 rounded-full" />
              <Skeleton className="h-3.5 w-40" />
            </div>
            <div className="size-10" />
          </div>
        </div>
        <div className="flex-1 p-6 space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </ImmersiveShell>
  );
}

// ---------- Live Sprint Result ----------

/** Live Sprint Result の本文（Summary と設問の2列）の骨組み */
function LessonSprintResultBody() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-wider">Summary</h2>
        </div>
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
      <div aria-hidden className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * Live Sprint Result の骨組み。ハブから実施した結果（?session_id= あり）は没入表示、
 * それ以外（履歴からの参照）は通常の画面で描く（本番の LessonSprintResult と同じ使い分け）。
 */
export function LessonSprintResultSkeleton({ studentId, sessionId }: { studentId: string; sessionId: string | null }) {
  if (sessionId) {
    return (
      <ImmersiveShell active className="flex flex-col">
        <ImmersiveHeader
          studentName={null}
          studentIconPath={null}
          title="Live Sprint Result"
          backHref={buildLiveSessionHubHref(studentId, sessionId)}
          backLabel="Back to Hub"
        />
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto w-full">
            <LessonSprintResultBody />
          </div>
        </div>
      </ImmersiveShell>
    );
  }
  return (
    <div className="max-w-7xl mx-auto w-full pb-6">
      <div className="space-y-1 pb-6">
        {/* 戻り先は遷移元で変わるため、読み込み中はリンクの位置だけを骨組みにする */}
        <Skeleton className="h-4 w-36" />
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Live Sprint Result</h1>
      </div>
      <LessonSprintResultBody />
    </div>
  );
}

// ---------- Session Result ----------

/** Session Result の骨組み（戻るリンク・見出し・区分・カードの見出しは本物） */
export function SessionResultSkeleton({ studentId }: { studentId: string }) {
  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-8">
      <div className="space-y-1">
        <Link
          href={`/students/${studentId}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Overview
        </Link>
        <h1 className="text-lg font-black text-slate-900">Session Result</h1>
      </div>
      <Section label="Summary" icon={Info}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TitledCardSkeleton title="Session Info" rows={2} />
          <TitledCardSkeleton title="Join / Leave Timeline" rows={2} />
        </div>
      </Section>
      <Section label="Homework" icon={BookOpen}>
        <Skeleton className="h-40 w-full rounded-2xl" />
      </Section>
      <Section label="Training">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TitledCardSkeleton title="Live Sprint History" rows={2} />
          <TitledCardSkeleton title="Dialog Practice History" rows={2} />
        </div>
      </Section>
      <Section label="Other" icon={MessageCircle}>
        <TitledCardSkeleton title="In-call Chat History" rows={2} />
      </Section>
    </div>
  );
}
