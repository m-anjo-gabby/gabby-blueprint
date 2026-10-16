/**
 * 要望・不具合の受付フォームと受付台帳を作る（Apps Script）
 *
 * 2026-10-13 に実行済み。今のフォーム・台帳の作り方の記録で、作り直すときの元にする。
 * 実行後に手で変えた点も反映している（補足資料の質問・管理用の列の見出しの色）。
 * 1000行目までの設定と、見出しの日本語化（受付日時・メールアドレス）は実行後に Sheets の接続で行った。
 * 作成先: 共有ドライブ B_運営共有/70_要望・不具合の受付
 */
const FOLDER_ID = '1Gs5vpWWA5XvgzTSmXxeZGdrNg51y2qLF';

const STATUS_VALUES = ['未対応', '対応中', '確認待ち', '対応済み', '見送り'];
const LEDGER_COLUMNS = ['状態', '担当', '対応予定日', '完了日', '対応メモ', '関連する案件'];

function createRequestForm() {
  const folder = DriveApp.getFolderById(FOLDER_ID);

  // ---- フォーム ----
  const form = FormApp.create('Gabby Blueprint 要望・不具合の受付');
  form
    .setDescription(
      'Gabby Blueprint（生徒アプリ・コーチアプリ・管理画面）へのご要望・不具合のご連絡はこちらからお願いします。\n' +
        '対応状況は、同じフォルダの「要望・不具合の受付台帳」でご確認いただけます。'
    )
    .setCollectEmail(true)
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(true)
    .setConfirmationMessage('受け付けました。開発チームが確認し、対応状況を受付台帳に記入します。');

  form.addMultipleChoiceItem()
    .setTitle('ご連絡の種類')
    .setChoiceValues(['不具合', '要望・改善案', '質問'])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('緊急度')
    .setChoiceValues([
      '至急：利用者が使えない状態（ログインできない、レッスンに入れない等）',
      '利用はできるが困っている',
      '急ぎではない',
    ])
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('対象のアプリ')
    .setChoiceValues(['生徒アプリ', 'コーチアプリ', '管理画面', 'メール', 'わからない'])
    .setRequired(true);

  form.addTextItem()
    .setTitle('画面・機能')
    .setHelpText('例：生徒アプリのホーム、管理画面のユーザー一覧')
    .setRequired(true);

  form.addDateTimeItem()
    .setTitle('起きた日時')
    .setHelpText('不具合の場合にご記入ください（おおよそで構いません）');

  form.addTextItem()
    .setTitle('対象の利用者')
    .setHelpText('メールアドレスなど。複数の場合は代表の方');

  form.addParagraphTextItem()
    .setTitle('内容')
    .setHelpText(
      '不具合の場合：行った操作の順番／期待していた結果／実際に起きたこと\n' +
        '要望の場合：困っていること／どうなると良いか'
    )
    .setRequired(true);

  // 共有ドライブのフォームでは「ファイルのアップロード」が使えないため、補足資料フォルダのリンクを書いてもらう
  form.addTextItem()
    .setTitle('補足資料のフォルダのリンク')
    .setHelpText(
      'スクリーンショットやログなどがある場合は、補足資料フォルダに' +
        '「YYYY-MM-DD_内容の短い説明」というフォルダを作って保存し、そのフォルダのリンクを貼ってください'
    )
    .setRequired(false);

  // ---- 受付台帳（フォームの回答先） ----
  const created = SpreadsheetApp.create('要望・不具合の受付台帳');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, created.getId());

  const ss = SpreadsheetApp.openById(created.getId());
  let sheet = null;
  for (let i = 0; i < 10 && !sheet; i++) {
    SpreadsheetApp.flush();
    sheet = ss.getSheets().find((s) => s.getFormUrl()) || null;
    if (!sheet) Utilities.sleep(1000);
  }
  if (!sheet) throw new Error('回答シートが見つかりません。時間をおいて再実行せず、作成済みのファイルを確認してください。');

  sheet.setName('受付台帳');
  ss.getSheets().filter((s) => s.getSheetId() !== sheet.getSheetId()).forEach((s) => ss.deleteSheet(s));

  // 開発チームが記入する管理列（フォームの列の右側）
  const startCol = sheet.getLastColumn() + 1;
  const rows = sheet.getMaxRows() - 1;
  sheet.getRange(1, startCol, 1, LEDGER_COLUMNS.length)
    .setValues([LEDGER_COLUMNS])
    .setFontWeight('bold')
    .setBackground('#b45f06') // 回答の表の見出しは文字が白のため、濃い色にする
    .setFontColor('#ffffff');

  const statusRange = sheet.getRange(2, startCol, rows, 1);
  statusRange.setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUS_VALUES, true).build()
  );
  sheet.getRange(2, startCol + 2, rows, 2).setDataValidation(
    SpreadsheetApp.newDataValidation().requireDate().build()
  ).setNumberFormat('yyyy-mm-dd');

  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('未対応').setBackground('#f4cccc').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('対応中').setBackground('#cfe2f3').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('確認待ち').setBackground('#fff2cc').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('対応済み').setBackground('#d9ead3').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('見送り').setBackground('#efefef').setRanges([statusRange]).build(),
  ]);

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setWrap(true).setVerticalAlignment('middle');

  // ---- 共有ドライブへ移動 ----
  DriveApp.getFileById(form.getId()).moveTo(folder);
  DriveApp.getFileById(ss.getId()).moveTo(folder);

  Logger.log('フォーム（回答用）: ' + form.getPublishedUrl());
  Logger.log('フォーム（編集用）: ' + form.getEditUrl());
  Logger.log('受付台帳: ' + ss.getUrl());
}
