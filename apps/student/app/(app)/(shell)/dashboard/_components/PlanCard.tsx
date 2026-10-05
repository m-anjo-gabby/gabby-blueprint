import { ExternalLink, Mail } from 'lucide-react';
import { buildSupportMailto } from '@gabby/lib/contact';
import { PRICE_PAGE_URL } from '@/constants/liveSessionIntro';
import type { MyPlan } from '@/actions/dashboardAction';
import { Skeleton } from '@/components/ui/skeleton';
import { HomeCard } from './HomeCard';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 契約の終了が近いことを知らせ始める、終了日までの日数 */
export const PLAN_EXPIRY_NOTICE_DAYS = 14;

const CARD_TITLE = 'ご契約プラン';

interface PlanCardProps {
  plans: MyPlan[];
  /** 現在時刻。確定前（初回表示のハイドレーション時）は null で、残り日数を骨組みにする */
  nowMs: number | null;
  timezone: string;
}

const formatDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('ja-JP', { timeZone, year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso));

const daysUntil = (iso: string, nowMs: number) => Math.max(Math.ceil((new Date(iso).getTime() - nowMs) / DAY_MS), 0);

/** 1件分の契約（プラン名・期間・残り日数または開始日） */
function PlanRow({ plan, nowMs, timezone }: { plan: MyPlan; nowMs: number | null; timezone: string }) {
  const isUpcoming = nowMs !== null && new Date(plan.start_date).getTime() > nowMs;
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-base font-bold text-ink">{plan.plan_name}</p>
        {nowMs === null ? (
          <Skeleton className="h-4 w-14 shrink-0" />
        ) : (
          <span className="shrink-0 text-xs text-ink-muted tabular-nums">
            {isUpcoming ? '開始前' : `残り${daysUntil(plan.end_date, nowMs)}日`}
          </span>
        )}
      </div>
      <p className="text-xs text-ink-muted tabular-nums">
        {formatDate(plan.start_date, timezone)}〜{formatDate(plan.end_date, timezone)}
      </p>
    </li>
  );
}

/**
 * 契約の終了が近いときの案内。アプリのみの契約のまま続ける生徒もいるため、特定のプランではなく継続そのものを促す文言にする。
 * 法人契約はご所属先・サポート窓口、個人での継続は料金ページへ案内する（法人契約の終了後に個人で続ける生徒もいる）。
 */
function ExpiryNotice({ endDate, timezone }: { endDate: string; timezone: string }) {
  return (
    <div className="mt-4 rounded-control border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-800">{formatDate(endDate, timezone)}でご契約が終了します</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        継続のお手続きをいただくと、終了後も引き続きご利用いただけます。ご所属先のご担当者様またはサポート窓口にご相談いただくか、個人でのご継続は料金ページからお申し込みください。
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <a
          href={PRICE_PAGE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-control bg-gold px-4 text-sm font-bold text-brand-deep shadow-sm transition-all hover:brightness-95 active:scale-[0.98]"
        >
          料金・お申し込みを見る
          <ExternalLink size={14} />
        </a>
        <a
          href={buildSupportMailto('契約の継続について')}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-brand transition-colors hover:border-brand-200 hover:bg-brand-soft"
        >
          <Mail size={14} />
          サポート窓口に相談する
        </a>
      </div>
    </div>
  );
}

/**
 * ご契約プラン（プラン名・期間・残り日数）。普段は控えめに表示し、すべての契約の終了まで
 * PLAN_EXPIRY_NOTICE_DAYS 日以内（後に続く契約が無い）になったら継続の案内を出す。
 */
export function PlanCard({ plans, nowMs, timezone }: PlanCardProps) {
  // 後に続く契約があれば終了の案内は出さないため、最も遅い終了日で判定する
  const lastEndDate = plans.reduce<string | null>((latest, p) => (latest === null || p.end_date > latest ? p.end_date : latest), null);
  const showExpiry = nowMs !== null && lastEndDate !== null && daysUntil(lastEndDate, nowMs) <= PLAN_EXPIRY_NOTICE_DAYS;

  return (
    <HomeCard title={CARD_TITLE}>
      <ul className="space-y-3">
        {plans.map((plan) => (
          <PlanRow key={plan.license_id} plan={plan} nowMs={nowMs} timezone={timezone} />
        ))}
      </ul>
      {showExpiry && lastEndDate && <ExpiryNotice endDate={lastEndDate} timezone={timezone} />}
    </HomeCard>
  );
}

/** ご契約プランの骨組み（契約1件の形。見出しは本物で描く。終了の案内は時刻の確定後にだけ出るため骨組みには含めない） */
export function PlanCardSkeleton() {
  return (
    <HomeCard title={CARD_TITLE}>
      <div className="space-y-1">
        <div className="flex h-6 items-center justify-between gap-3">
          <Skeleton className="h-4.5 w-32" />
          <Skeleton className="h-4 w-14" />
        </div>
        <div className="flex h-4 items-center">
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
    </HomeCard>
  );
}
