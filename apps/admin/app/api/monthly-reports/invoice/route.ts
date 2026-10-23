import { renderToBuffer } from '@react-pdf/renderer';
import { NextResponse, type NextRequest } from 'next/server';
import { fetchCompanyProfile } from '@gabby/lib/companyProfile/fetchCompanyProfile';
import { getCompanyLogoUrl } from '@gabby/lib/companyProfile/getCompanyLogoUrl';
import { getAdminCoachMonthlyReportCore } from '@gabby/lib/monthlyReport/actions/monthlyReportActions';
import { buildInvoiceNumber } from '@gabby/lib/monthlyReport/buildInvoiceNumber';
import { getApprovedCounts } from '@gabby/lib/monthlyReport/reportCounts';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { fetchLegalName } from '@gabby/lib/userLegal/fetchLegalName';
import { formatLegalName } from '@gabby/lib/userLegal/formatLegalName';
import { DOCUMENT_ISSUER } from '@gabby/types/companyProfile';
import { checkAdminRoleForRoute, SYSTEM_ADMIN_ONLY } from '@/lib/adminAuth';
import { InvoiceDocument } from '@/lib/pdf/InvoiceDocument';

// apps/coach/app/api/monthly-reports/pay-notice/route.tsと同じ理由（cookieベース認証への
// 依存がNext.jsの自動動的判定に検出されず静的キャッシュされる恐れがあるため）で、
// 明示的に動的レンダリングを強制する。
export const dynamic = 'force-dynamic';

/**
 * 指定コーチ・対象月の、承認済み月次コーチングレポートに基づく請求書(INVOICE)PDFを
 * アドミンがダウンロードする。?coachId=...&month=YYYY-MM を指定。
 * ページ遷移自体はapps/admin/proxy.tsのミドルウェアで管理者以外を弾いているが、
 * コーチの支払実績という機密情報を扱うため、本ルートでも防御的に管理者であることを
 * 再検証する（apps/coach側のpay-notice/route.tsと同じ方針）。
 */
export async function GET(request: NextRequest) {
  const coachId = request.nextUrl.searchParams.get('coachId');
  const reportMonth = request.nextUrl.searchParams.get('month');
  if (!coachId || !reportMonth) {
    return NextResponse.json({ error: 'coachId and month query parameters are required' }, { status: 400 });
  }

  const { denied } = await checkAdminRoleForRoute(SYSTEM_ADMIN_ONLY);
  if (denied) return denied;

  const result = await getAdminCoachMonthlyReportCore(coachId, reportMonth);
  if (!result.success) {
    return NextResponse.json({ error: result.errorCode }, { status: 403 });
  }
  // 件数・内訳・金額は承認時点のスナップショットで作る（承認後に実施結果を直しても書面の金額を変えない）
  const approval = result.report.approval;
  const approvedCounts = getApprovedCounts(approval);
  if (!approval || !approvedCounts) {
    return NextResponse.json({ error: 'monthly report is not approved yet' }, { status: 403 });
  }

  const admin = createAdminClient();
  const [companyProfile, { data: coachUser }, legalName] = await Promise.all([
    fetchCompanyProfile(DOCUMENT_ISSUER.coachInvoice),
    admin.from('com_m_user').select('user_name').eq('id', coachId).maybeSingle(),
    fetchLegalName(coachId),
  ]);

  // 支払通知書(PayNoticeDocument)と同じ算出方法。単価自体は書面に表示しない。
  const totalEarnings = (approval.rate_amount ?? 0) * approvedCounts.total;
  const currencyCode = approval.rate_currency ?? '';

  // Issue Dateは支払通知書と同じくアドミンの承認日時とする（再ダウンロードしても常に
  // 同じ内容になるように、承認時点の事実を表示する）。
  const issueDateLabel = approval.approved_at
    ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
        new Date(approval.approved_at),
      )
    : '';

  const [year, month] = result.report.report_month.split('-').map(Number);
  const periodLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );

  // 支払通知書と同じく、正式な氏名（未登録の場合は画面の名前）を載せる
  const contractorName = formatLegalName(legalName, 'en') ?? coachUser?.user_name ?? 'Coach';
  const invoiceNumber = buildInvoiceNumber(coachId, result.report.report_month);
  const fileNameBase = `Invoice_${contractorName.replace(/[\\/:*?"<>|]/g, '_').trim()}_${result.report.report_month.slice(0, 7)}`;
  const asciiFallbackFileName = fileNameBase.replace(/[^\x20-\x7E]/g, '_');

  const buffer = await renderToBuffer(
    InvoiceDocument({
      invoiceNumber,
      companyName: companyProfile?.company_name ?? '',
      companyAddress: companyProfile?.address ?? '',
      taxRegistrationNumber: companyProfile?.tax_registration_number ?? null,
      logoSrc: getCompanyLogoUrl(companyProfile?.logo_path),
      contractorName,
      periodLabel,
      issueDateLabel,
      currencyCode,
      totalSessions: approvedCounts.total,
      completedCount: approvedCounts.completed,
      lateCancelCount: approvedCounts.late_cancel,
      noShowCount: approvedCounts.no_show,
      totalEarnings,
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${asciiFallbackFileName}.pdf"; filename*=UTF-8''${encodeURIComponent(fileNameBase)}.pdf`,
      'Cache-Control': 'no-store',
    },
  });
}
