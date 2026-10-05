import { NextRequest, NextResponse } from 'next/server';
import { fetchTrainingReportData, isAdminRequest, renderTrainingReportPdfs } from '@/lib/trainingReport/queries';
import { buildContentDisposition, buildTrainingReportFileBase } from '@/lib/trainingReport/format';

// 認証(cookie)に依存し、作成のたびに最新のデータからPDFを作るため、静的キャッシュさせない
export const dynamic = 'force-dynamic';

/**
 * 生徒向けトレーニングレポート(PDF)を1人分ダウンロードする。?licenseId=... を指定。
 * 生徒の学習記録を扱うため、画面遷移の制御（proxy.ts）に加えて、ここでも管理者であることを確認する。
 */
export async function GET(request: NextRequest) {
  const licenseId = request.nextUrl.searchParams.get('licenseId');
  if (!licenseId) {
    return NextResponse.json({ error: 'licenseId query parameter is required' }, { status: 400 });
  }
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const reports = await fetchTrainingReportData([licenseId]);
  if (!reports) {
    return NextResponse.json({ error: 'failed to load report data' }, { status: 500 });
  }
  const [data] = reports;
  if (!data) {
    return NextResponse.json({ error: 'license not found' }, { status: 404 });
  }

  const [buffer] = await renderTrainingReportPdfs([data]);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': buildContentDisposition(`${buildTrainingReportFileBase(data)}.pdf`),
      'Cache-Control': 'no-store',
    },
  });
}
