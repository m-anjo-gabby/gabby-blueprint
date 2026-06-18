$PROD_ID  = "xzoefwwzminkqqzbhtwq"
$STG_ID   = "vodmgorcugymrpdmdqkg"
$TEMP_DIR = "temp_data"
$LOG_FILE = "$TEMP_DIR/sync_process.log"

$CURRENT_DIR = (Get-Location).Path
$MASK_SQL_FILE = "$CURRENT_DIR/apply_mask.sql"

if (!(Test-Path $TEMP_DIR)) { New-Item -ItemType Directory -Path $TEMP_DIR }

"--- Sync Log Started at $(Get-Date) ---" | Out-File -FilePath $LOG_FILE -Encoding UTF8

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "    Database Sync Tool (Prod -> Stg)" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Write-Host "`nSelect Mode:" -ForegroundColor Yellow
Write-Host " [1] Full Sync (Export Prod + Restore Stg)"
Write-Host " [2] Restore Only (Using local dump files)"
$MODE = Read-Host -Prompt "Enter number (1 or 2)"

if ($MODE -ne "1" -and $MODE -ne "2") {
    Write-Host "Invalid mode. Canceled." -ForegroundColor Red
    exit
}

Write-Host "`n--- Password Input ---" -ForegroundColor Cyan
$PROD_PASS_RAW = ""
if ($MODE -eq "1") {
    $PROD_PASS_RAW = Read-Host -Prompt "Enter Password for Prod [$PROD_ID]"
}
$STG_PASS_RAW  = Read-Host -Prompt "Enter Password for Stg [$STG_ID]"

$PROD_PASS_ENC = if ($PROD_PASS_RAW) { [uri]::EscapeDataString($PROD_PASS_RAW) } else { "" }
$STG_PASS_ENC  = [uri]::EscapeDataString($STG_PASS_RAW)

$PROD_URL = "postgresql://postgres:$PROD_PASS_ENC@db.$PROD_ID.supabase.co:5432/postgres"
$STG_URL  = "postgresql://postgres:$STG_PASS_ENC@db.$STG_ID.supabase.co:5432/postgres"

$env:PGCLIENTENCODING = 'UTF8'

if ($MODE -eq "1") {
    Write-Host "`n[1/3] Exporting from Prod..." -ForegroundColor Cyan
    
    # 1. 全スキーマ構造の取得 (schema_migrationsなどを除外)
    "Executing pg_dump for schema-only..." | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
    & pg_dump --dbname="$PROD_URL" --schema-only --schema=public --schema=private --schema=auth --exclude-table="public.schema_migrations" -f "$TEMP_DIR/prod_schema.sql" *>&1 | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8

    # 2. public と private の全アプリデータを高速なCOPY形式で取得
    "Executing pg_dump for app data (public & private)..." | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
    & pg_dump --dbname="$PROD_URL" --data-only --schema=public --schema=private --exclude-table="public.schema_migrations" -f "$TEMP_DIR/prod_data_app.sql" *>&1 | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8

    # 3. auth.users のデータだけを個別かつ安全な INSERT 形式で取得
    "Executing pg_dump for auth users (INSERT format)..." | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
    & pg_dump --dbname="$PROD_URL" --data-only --inserts -t "auth.users" -f "$TEMP_DIR/prod_data_auth.sql" *>&1 | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
} else {
    Write-Host "`n[1/3] Skip export. Using local dump files." -ForegroundColor Gray
}

Write-Host "`n[2/3] Caution: This will RESET Staging database." -ForegroundColor Red
$confirm = Read-Host "Proceed with reset and restore? (y/n)"
if ($confirm -ne 'y') { 
    Write-Host "Cancelled." -ForegroundColor Gray
    exit 
}

Write-Host "Restoring to Staging..." -ForegroundColor Yellow

# 1. アプリデータ用のスキーマのみを完全にリセット（authは絶対にいじらない）
"Resetting public and private schemas..." | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
& psql --dbname="$STG_URL" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS private CASCADE; CREATE SCHEMA private;" *>&1 | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8

# 2. スキーマ構造（テーブルやビューの定義）を流し込む
"Restoring schemas..." | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
& psql --dbname="$STG_URL" --set ON_ERROR_STOP=off -c "SET session_replication_role = 'replica';" -f "$TEMP_DIR/prod_schema.sql" *>&1 | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8

# 3. 【核心部分】auth.users のインポートファイルを強力な「UPSERT（ON CONFLICT UPDATE）」構文に自動書き換え
"Converting auth INSERT statements to secure UPSERT..." | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
$AUTH_SQL_PATH = "$TEMP_DIR/prod_data_auth.sql"
if (Test-Path $AUTH_SQL_PATH) {
    $content = Get-Content -Path $AUTH_SQL_PATH -Raw -Encoding UTF8
    if ($content -match "INSERT INTO auth.users") {
        # 重複時に差分を安全に上書きアップデートするUPSERT構文へ正規表現置換
        $upsert_suffix = ") ON CONFLICT (id) DO UPDATE SET instance_id = EXCLUDED.instance_id, email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password, email_confirmed_at = EXCLUDED.email_confirmed_at, raw_app_meta_data = EXCLUDED.raw_app_meta_data, raw_user_meta_data = EXCLUDED.raw_user_meta_data, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, role = EXCLUDED.role, confirmation_token = EXCLUDED.confirmation_token;"
        $content = $content -replace '(?i)\)\s*VALUES\s*\(([^\;]+)\);', $upsert_suffix
        $content | Out-File -FilePath $AUTH_SQL_PATH -Encoding UTF8
    }
}

# 4. auth.users データの流し込み（UPSERTされるため既存データ破壊も衝突ストップも絶対に起きません）
"Restoring auth users data via UPSERT..." | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
& psql --dbname="$STG_URL" --set ON_ERROR_STOP=off -c "SET session_replication_role = 'replica';" -f "$TEMP_DIR/prod_data_auth.sql" *>&1 | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8

# 5. public & private アプリデータの流し込み
"Restoring app data (public & private)..." | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
& psql --dbname="$STG_URL" --set ON_ERROR_STOP=off -c "SET session_replication_role = 'replica';" -f "$TEMP_DIR/prod_data_app.sql" *>&1 | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8

Write-Host "`n[3/3] Masking sensitive data..." -ForegroundColor Magenta

if (Test-Path $MASK_SQL_FILE) {
    "Executing data masking script ($MASK_SQL_FILE)..." | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
    & psql --dbname="$STG_URL" -f "$MASK_SQL_FILE" *>&1 | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
}

# 最後にPostgRESTのスキーマキャッシュを自動リロード
"Reloading schema cache..." | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
& psql --dbname="$STG_URL" -c "NOTIFY pgrst, 'reload schema';" *>&1 | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8

"--- Sync Log Completed at $(Get-Date) ---" | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
Write-Host "`n--- All Tasks Completed Successfully! ---" -ForegroundColor Green
Write-Host "Log file: $LOG_FILE" -ForegroundColor Gray