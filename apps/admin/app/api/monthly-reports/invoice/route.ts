import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getAdminCoachMonthlyReportCore } from '@gabby/lib/monthlyReport/actions/monthlyReportActions';
import { getCompanyLogoUrl } from '@gabby/lib/monthlyReport/getCompanyLogoUrl';
import { buildInvoiceNumber } from '@gabby/lib/monthlyReport/buildInvoiceNumber';
import { createServerClient } from '@gabby/lib/supabase/server';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { USER_TYPES } from '@gabby/types/user';
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

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (user.app_metadata?.user_type !== USER_TYPES.ADMIN) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const result = await getAdminCoachMonthlyReportCore(coachId, reportMonth);
  if (!result.success) {
    return NextResponse.json({ error: result.errorCode }, { status: 403 });
  }
  if (result.report.approval?.status !== 2) {
    return NextResponse.json({ error: 'monthly report is not approved yet' }, { status: 403 });
  }

  const admin = createAdminClient();
  const [{ data: companyProfile }, { data: coachUser }] = await Promise.all([
    admin.from('com_m_company_profile').select('company_name, address, logo_path, tax_registration_number').maybeSingle(),
    admin.from('com_m_user').select('user_name').eq('id', coachId).maybeSingle(),
  ]);

  const approval = result.report.approval;
  // 支払通知書(PayNoticeDocument)と同じ算出方法。単価自体は書面に表示しない。
  const totalEarnings = (approval.rate_amount ?? 0) * result.report.grand_total;
  const currencyCode = approval.rate_currency ?? '';

  // Issue Dateは支払通知書と同じくアドミンの承認日時とする（再ダウンロードしても常に
  // 同じ内容になるように、承認時点の事実を表示する）。
  const issueDateLabel = approval.approved_at
    ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
        new Date(approval.approved_at)
      )
    : '';

  const [year, month] = result.report.report_month.split('-').map(Number);
  const periodLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );

  const contractorName = coachUser?.user_name ?? 'Coach';
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
      totalSessions: result.report.grand_total,
      completedCount: result.report.completed_count,
      lateCancelCount: result.report.late_cancel_count,
      noShowCount: result.report.no_show_count,
      totalEarnings,
    })
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
