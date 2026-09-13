import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getCoachMonthlyReportCore } from '@gabby/lib/monthlyReport/actions/monthlyReportActions';
import { getCompanyLogoUrl } from '@gabby/lib/monthlyReport/getCompanyLogoUrl';
import { createServerClient } from '@gabby/lib/supabase/server';
import { createAdminClient } from '@gabby/lib/supabase/admin';
import { PayNoticeDocument } from '@/lib/pdf/PayNoticeDocument';

// このRoute Handlerはcookieベースの認証(createServerClient)に依存しているが、その呼び出しが
// getCoachMonthlyReportCore内部に隠れているため、Next.jsの自動動的判定に検出されず
// 静的にキャッシュされる可能性がある。PDFレイアウト調整中に変更が反映されないという
// 問題（シークレットウィンドウでも解消しない＝サーバー側キャッシュの疑い）を避けるため、
// 明示的に動的レンダリングを強制する。
export const dynamic = 'force-dynamic';

/**
 * ログイン中コーチ自身の、承認済み月次コーチングレポートに基づく支払通知書(PDF)をダウンロードする。
 * ?month=YYYY-MM を指定。承認済み(status=2)でない月・自分以外の月は403で拒否する
 * （getCoachMonthlyReportCoreが自分自身の月のみを返す前提に加え、ここでも承認状態を再検証する）。
 */
export async function GET(request: NextRequest) {
  const reportMonth = request.nextUrl.searchParams.get('month');
  if (!reportMonth) {
    return NextResponse.json({ error: 'month query parameter is required' }, { status: 400 });
  }

  const result = await getCoachMonthlyReportCore(reportMonth);
  if (!result.success) {
    return NextResponse.json({ error: result.errorCode }, { status: result.errorCode === 'unauthorized' ? 401 : 403 });
  }
  if (result.report.approval?.status !== 2) {
    return NextResponse.json({ error: 'monthly report is not approved yet' }, { status: 403 });
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { data: coachUser } = await supabase.from('com_m_user').select('user_name').eq('id', user.id).maybeSingle();

  // com_m_company_profileはRLSで管理者のみ参照可能なため、ここではサーバー側の信頼済み
  // コードとしてcreateAdminClient()(service_role)経由で読む（コーチ自身に直接SELECT権限は与えない）。
  const admin = createAdminClient();
  const { data: companyProfile } = await admin
    .from('com_m_company_profile')
    .select('company_name, address, logo_path')
    .maybeSingle();

  const approval = result.report.approval;
  // 単価自体は書面に表示しない（今後コーチ別に単価が変わり得るため）が、支払額の算出には
  // 承認時点のスナップショット値(approval.rate_amount)を使う。
  const totalEarnings = (approval.rate_amount ?? 0) * result.report.grand_total;
  const currencyCode = approval.rate_currency ?? '';

  // Issue Dateはダウンロード時刻ではなく、アドミンが承認した日時とする（再ダウンロードしても
  // 常に同じ内容になるように、承認時点の事実を表示する）。
  const issueDateLabel = approval.approved_at ? approval.approved_at.slice(0, 10) : '';

  const [year, month] = result.report.report_month.split('-').map(Number);
  const periodLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );

  const contractorName = coachUser?.user_name ?? 'Coach';
  const fileNameBase = `MonthlyPayNotice_${contractorName.replace(/[\\/:*?"<>|]/g, '_').trim()}_${result.report.report_month.slice(0, 7)}`;
  // コーチ名に日本語等の非ASCII文字が含まれる場合に備え、ASCII版のfilenameとRFC5987準拠の
  // filename*(UTF-8)の両方を付与する（前者は非対応クライアント向けのフォールバック）。
  const asciiFallbackFileName = fileNameBase.replace(/[^\x20-\x7E]/g, '_');

  const buffer = await renderToBuffer(
    PayNoticeDocument({
      companyName: companyProfile?.company_name ?? '',
      companyAddress: companyProfile?.address ?? '',
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
      // 同一URL(?month=YYYY-MM)への再ダウンロード時に、ブラウザ側のHTTPキャッシュで
      // 古い内容が返されることを防ぐ（PDFレイアウト調整中に変更が反映されないという
      // 混乱を避けるため）。
      'Cache-Control': 'no-store',
    },
  });
}
