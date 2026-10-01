import { NextRequest, NextResponse } from 'next/server';
import { zipSync } from 'fflate';
import { TRAINING_REPORT_BULK_LIMIT } from '@gabby/types/trainingReport';
import {
  fetchContractLicenseIds,
  fetchTrainingReportData,
  isAdminRequest,
  renderTrainingReportPdfs,
} from '@/lib/trainingReport/queries';
import { buildContentDisposition, buildTrainingReportFileBase, buildTrainingReportZipBase } from '@/lib/trainingReport/format';

// 認証(cookie)に依存し、作成のたびに最新のデータからPDFを作るため、静的キャッシュさせない
export const dynamic = 'force-dynamic';
// 契約の人数分のPDFを順に作るため、既定より長めに待つ
export const maxDuration = 60;

/**
 * 契約に紐づくライセンス保持者全員のトレーニングレポートを、1人1ファイルのPDFにしてZIPでまとめて返す。
 * ?contractId=... を指定。配布は生徒ごとに個別に行うため、PDFは結合しない。
 */
export async function GET(request: NextRequest) {
  const contractId = request.nextUrl.searchParams.get('contractId');
  if (!contractId) {
    return NextResponse.json({ error: 'contractId query parameter is required' }, { status: 400 });
  }
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const contract = await fetchContractLicenseIds(contractId);
  if (!contract) {
    return NextResponse.json({ error: 'contract not found' }, { status: 404 });
  }
  if (contract.licenseIds.length === 0) {
    return NextResponse.json({ error: 'no licenses in this contract' }, { status: 404 });
  }
  if (contract.licenseIds.length > TRAINING_REPORT_BULK_LIMIT) {
    return NextResponse.json({ error: `too many licenses (max ${TRAINING_REPORT_BULK_LIMIT})` }, { status: 400 });
  }

  const reports = await fetchTrainingReportData(contract.licenseIds);
  if (!reports) {
    return NextResponse.json({ error: 'failed to load report data' }, { status: 500 });
  }

  const buffers = await renderTrainingReportPdfs(reports);

  // 同姓同名の生徒がいてもファイルが上書きされないよう、重複した名前には連番を付ける
  const files: Record<string, Uint8Array> = {};
  reports.forEach((data, index) => {
    const base = buildTrainingReportFileBase(data);
    let name = `${base}.pdf`;
    for (let n = 2; files[name]; n++) name = `${base}(${n}).pdf`;
    files[name] = new Uint8Array(buffers[index]);
  });
  // PDFは既に圧縮済みのため、無圧縮(level 0)で格納して処理時間を抑える
  const zip = zipSync(files, { level: 0 });

  return new NextResponse(zip, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': buildContentDisposition(`${buildTrainingReportZipBase(contract.contractName, new Date())}.zip`),
      'Cache-Control': 'no-store',
    },
  });
}
