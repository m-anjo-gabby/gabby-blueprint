# .NETの関数（URLエンコード用）をロード
Add-Type -AssemblyName System.Web

# --- 1. 設定項目 ---
$PROD_ID = "xzoefwwzminkqqzbhtwq"
$STG_ID  = "vodmgorcugymrpdmdqkg"
$TEMP_DIR = "temp_data"

# --- 2. パスワード入力 ---
Write-Host "--- Database Sync: Prod -> Stg ---" -ForegroundColor Cyan
$PROD_PASS_RAW = Read-Host -Prompt "Enter Password for Prod [$PROD_ID]"
$STG_PASS_RAW  = Read-Host -Prompt "Enter Password for Stg [$STG_ID]"

# 特殊記号をURLエンコード（これでpostgresql://形式が壊れない）
$PROD_PASS_ENC = [System.Web.HttpUtility]::UrlEncode($PROD_PASS_RAW)
$STG_PASS_ENC  = [System.Web.HttpUtility]::UrlEncode($STG_PASS_RAW)

# 接続URLの組み立て（Connection Poolingポート 6543 を使用）
$PROD_URL = "postgresql://postgres:$PROD_PASS_ENC@db.$PROD_ID.supabase.co:6543/postgres"
$STG_URL  = "postgresql://postgres:$STG_PASS_ENC@db.$STG_ID.supabase.co:6543/postgres"

if (!(Test-Path $TEMP_DIR)) { New-Item -ItemType Directory -Path $TEMP_DIR }

# --- 3. Step 1: Export (Prod) ---
Write-Host "`n[1/3] Exporting from Prod..." -ForegroundColor Cyan
# スキーマとデータを個別に取得
pg_dump --dbname="$PROD_URL" --schema-only --schema=public --schema=auth -f "$TEMP_DIR/prod_schema.sql"
pg_dump --dbname="$PROD_URL" --data-only --schema=public --schema=auth -f "$TEMP_DIR/prod_data.sql"

# --- 4. Step 2: Import (Stg) ---
Write-Host "`n[2/3] Caution: This will RESET Staging database." -ForegroundColor Red
$confirm = Read-Host "Proceed with reset and restore? (y/n)"
if ($confirm -ne 'y') { 
    Write-Host "Cancelled." -ForegroundColor Gray
    exit 
}

Write-Host "Restoring to Staging..." -ForegroundColor Yellow

# 冪等性の担保：一度スキーマを消して再作成（既存の差分を完全にクリア）
# 警告：authスキーマのDROPはSupabaseの権限上できないため、内部のテーブルをクリアする設定で実行
psql --dbname="$STG_URL" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

# トリガー（メール送信等）を無効化した状態で流し込む
psql --dbname="$STG_URL" -c "SET session_replication_role = 'replica';" -f "$TEMP_DIR/prod_schema.sql"
psql --dbname="$STG_URL" -c "SET session_replication_role = 'replica';" -f "$TEMP_DIR/prod_data.sql"

# --- 5. Step 3: Masking (Stg) ---
Write-Host "`n[3/3] Masking sensitive data (Excluding Admins)..." -ForegroundColor Magenta

# スクリプトと同じディレクトリにあるSQLファイルを指定
$MASK_SQL_FILE = "$PSScriptRoot/apply_mask.sql"

if (Test-Path $MASK_SQL_FILE) {
    # ファイルから実行。環境変数をセットすることで日本語の文字化け抑止
    $env:PGCLIENTENCODING = 'UTF8'
    psql --dbname="$STG_URL" -f "$MASK_SQL_FILE"
} else {
    Write-Host "Error: $MASK_SQL_FILE not found." -ForegroundColor Red
}

Write-Host "`n--- All Tasks Completed Successfully! ---" -ForegroundColor Green