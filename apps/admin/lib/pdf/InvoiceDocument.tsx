import path from 'node:path';
import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';

// コーチ名・会社住所等に日本語が含まれる場合の文字化け対策。詳細はapps/coach/lib/pdf/
// PayNoticeDocument.tsxの同名処理のコメントを参照（本コンポーネントもコーチ向け支払通知書と
// 同じ理由・同じフォントファイルを使用する）。
Font.register({
  family: 'NotoSansJP',
  fonts: [
    { src: path.join(process.cwd(), 'lib/pdf/fonts/NotoSansJP-Medium.otf'), fontWeight: 400 },
    { src: path.join(process.cwd(), 'lib/pdf/fonts/NotoSansJP-Bold.otf'), fontWeight: 700 },
  ],
});

export interface InvoiceData {
  invoiceNumber: string;
  companyName: string;
  companyAddress: string;
  taxRegistrationNumber: string | null; // 設定されている場合のみ印字（任意項目）
  logoSrc: string | null; // ローカルファイルパス、またはURL（Supabase Storageの公開URL等）
  contractorName: string;
  periodLabel: string; // e.g. "September 2026"
  issueDateLabel: string; // e.g. "September 13, 2026"（アドミンの承認日。支払通知書と同じ値）
  currencyCode: string;
  totalSessions: number;
  completedCount: number;
  lateCancelCount: number;
  noShowCount: number;
  totalEarnings: number;
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'NotoSansJP', color: '#000000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  logo: { width: 120 },
  // 会社名・住所各行(いずれも幅の異なる独立したText)を右端で揃えるため、textAlignではなく
  // alignItems:'flex-end'で各子要素自体をコンテナ右端に個別配置する（textAlignは各Text
  // 自身の描画幅の中で文字を右寄せするだけで、幅の異なる兄弟Text同士の右端は揃わないため
  // 採用しなかった）。
  companyBlock: { alignItems: 'flex-end' },
  companyName: { fontSize: 12, fontWeight: 700, marginBottom: 2, color: '#000000' },
  companyAddress: { fontSize: 9, color: '#666666', lineHeight: 1.4 },
  companyTaxNumber: { fontSize: 9, color: '#666666', marginTop: 2 },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 20, textAlign: 'center', color: '#000000' },
  fieldRow: { flexDirection: 'row', marginBottom: 8 },
  fieldLabel: { width: 180, color: '#666666' },
  fieldValue: { flex: 1, fontWeight: 700, color: '#000000' },
  divider: { borderBottomWidth: 1, borderBottomColor: '#666666', marginVertical: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 8, color: '#000000' },
  table: { marginBottom: 16 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#cccccc', paddingVertical: 6 },
  tableRowLast: { flexDirection: 'row', paddingVertical: 6 },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#666666', paddingBottom: 6, marginBottom: 2 },
  tableHeaderCellLabel: { flex: 2, color: '#000000' },
  tableCellLabel: { flex: 2, color: '#666666' },
  tableCellValue: { flex: 1, textAlign: 'right', color: '#000000' },
  totalRow: { flexDirection: 'row', paddingTop: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: '#666666' },
  totalLabel: { flex: 2, fontSize: 12, fontWeight: 700, color: '#000000' },
  totalValue: { flex: 1, fontSize: 12, fontWeight: 700, textAlign: 'right', color: '#000000' },
  paidBadge: { fontSize: 10, fontWeight: 700, color: '#0a7a3d', marginTop: 4 },
  footer: { marginTop: 30, fontSize: 8, color: '#666666' },
  footerLine: { marginTop: 4, fontSize: 8, color: '#666666' },
});

function formatCurrency(amount: number, currencyCode: string): string {
  return `${currencyCode} ${amount.toFixed(2)}`;
}

/**
 * アドミン向け請求書(INVOICE)PDF。会計記録用に、承認済み月次コーチングレポートの支払実績を
 * 正式な書面として残すためのもの（コーチ向け支払通知書PayNoticeDocumentと同じ集計データを
 * 使い、フォーマットのみ異なる）。支払済みの実績証明として発行するため、支払条件(Payment
 * Terms)・振込先は記載しない。
 */
export function InvoiceDocument(data: InvoiceData) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image (PDF primitive), not an HTML/next/image element; alt has no meaning here */}
          {data.logoSrc ? <Image src={data.logoSrc} style={styles.logo} /> : <View />}
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{data.companyName}</Text>
            {/* 改行区切りの住所を1つのTextに\n込みで渡すと、react-pdf(Yoga)が複数行を
                1つの描画幅として誤って計測し、companyBlockのalignItems:'flex-end'による
                右端揃えが行単位で効かなくなる。行ごとに独立したTextに分割することで、
                各行が個別にcompanyBlockの右端へ配置される。 */}
            {data.companyAddress.split('\n').map((line, index) => (
              <Text key={index} style={styles.companyAddress}>
                {line}
              </Text>
            ))}
            {data.taxRegistrationNumber && (
              <Text style={styles.companyTaxNumber}>Tax Registration No. {data.taxRegistrationNumber}</Text>
            )}
          </View>
        </View>

        <Text style={styles.title}>INVOICE</Text>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Invoice Number</Text>
          <Text style={styles.fieldValue}>{data.invoiceNumber}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Bill To</Text>
          <Text style={styles.fieldValue}>{data.contractorName}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Period</Text>
          <Text style={styles.fieldValue}>{data.periodLabel}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Issue Date</Text>
          <Text style={styles.fieldValue}>{data.issueDateLabel}</Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Session Breakdown</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.tableHeaderCellLabel}>Category</Text>
            <Text style={styles.tableCellValue}>Sessions</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellLabel}>Completed</Text>
            <Text style={styles.tableCellValue}>{data.completedCount}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellLabel}>Late Cancel (within 12h)</Text>
            <Text style={styles.tableCellValue}>{data.lateCancelCount}</Text>
          </View>
          <View style={styles.tableRowLast}>
            <Text style={styles.tableCellLabel}>No Show</Text>
            <Text style={styles.tableCellValue}>{data.noShowCount}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Sessions</Text>
            <Text style={styles.totalValue}>{data.totalSessions}</Text>
          </View>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Amount</Text>
          <Text style={styles.totalValue}>{formatCurrency(data.totalEarnings, data.currencyCode)}</Text>
        </View>
        <Text style={styles.paidBadge}>PAID</Text>

        <Text style={styles.footer}>
          This invoice reflects the session record approved by {data.companyName} for the period stated above, and
          confirms that the amount above has been paid to the named contractor.
        </Text>
        <Text style={styles.footerLine}>
          This document contains confidential payment information and is retained for accounting record purposes.
        </Text>
      </Page>
    </Document>
  );
}
