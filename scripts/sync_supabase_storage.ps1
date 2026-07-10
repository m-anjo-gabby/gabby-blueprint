# scripts\sync_supabase_storage.ps1

# -----------------------------------------------------------------
# 環境設定（各環境のSupabaseプロジェクトID）
# -----------------------------------------------------------------
$DEV_ID   = "vihincuxiizavuxoctul"                                    # 開発（Dev）のプロジェクトID
$STG_ID   = "vodmgorcugymrpdmdqkg"                                    # ステージングのプロジェクトID
$PROD_ID  = "xzoefwwzminkqqzbhtwq"                                    # 本番のプロジェクトID

$TEMP_DIR = "temp_data"
$LOG_FILE = "$TEMP_DIR/storage_generic_sync.log"

if (!(Test-Path $TEMP_DIR)) { New-Item -ItemType Directory -Path $TEMP_DIR }

"--- Storage Generic Sync Log Started at $(Get-Date) ---" | Out-File -FilePath $LOG_FILE -Encoding UTF8

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "    Supabase Storage Generic Sync Tool" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# -----------------------------------------------------------------
# 1. 同期パターンの選択
# -----------------------------------------------------------------
Write-Host "`nSelect Sync Direction:" -ForegroundColor Yellow
Write-Host " [1] Dev ($DEV_ID) -> Staging ($STG_ID)"
Write-Host " [2] Staging ($STG_ID)   -> Production ($PROD_ID)"
Write-Host " [3] Production ($PROD_ID) -> Staging ($STG_ID)"
$DIRECTION = Read-Host -Prompt "Enter number (1, 2, or 3)"

# 各種変数のマッピング
switch ($DIRECTION) {
    "1" {
        $SRC_NAME = "Dev";        $SRC_ID  = $DEV_ID
        $DST_NAME = "Staging";    $DST_ID  = $STG_ID
    }
    "2" {
        $SRC_NAME = "Staging";    $SRC_ID  = $STG_ID
        $DST_NAME = "Production"; $DST_ID  = $PROD_ID
    }
    "3" {
        $SRC_NAME = "Production"; $SRC_ID  = $PROD_ID
        $DST_NAME = "Staging";    $DST_ID  = $STG_ID
    }
    Default {
        Write-Host "Invalid choice. Canceled." -ForegroundColor Red
        exit
    }
}

# -----------------------------------------------------------------
# 2. 対象バケット名・フォルダパスの入力
# -----------------------------------------------------------------
Write-Host "`n--- Target Path Input ---" -ForegroundColor Cyan
$BUCKET_NAME = Read-Host -Prompt "Enter Bucket Name (e.g., audio)"
if ([string]::IsNullOrEmpty($BUCKET_NAME)) {
    Write-Host "Bucket name cannot be empty. Canceled." -ForegroundColor Red
    exit
}

$FOLDER_PATH = Read-Host -Prompt "Enter Folder Path inside bucket (e.g., sprint/12121f66-a71e-4459-9136-de0d2b86185c)"
if ([string]::IsNullOrEmpty($FOLDER_PATH)) {
    Write-Host "Folder path cannot be empty. Canceled." -ForegroundColor Red
    exit
}

# 先頭や末尾の不要なスラッシュをトリムして整形
$BUCKET_NAME = $BUCKET_NAME.Trim('/')
$FOLDER_PATH = $FOLDER_PATH.Trim('/')

# フルストレージURLの組み立て
$SRC_STORAGE_URL = "ssb://$SRC_ID/$BUCKET_NAME/$FOLDER_PATH"
$DST_STORAGE_URL = "ssb://$DST_ID/$BUCKET_NAME/$FOLDER_PATH"

# 確認
Write-Host "`n[Caution] This will sync assets from $SRC_NAME to $DST_NAME." -ForegroundColor Yellow
Write-Host "Source:      $SRC_STORAGE_URL" -ForegroundColor Gray
Write-Host "Destination: $DST_STORAGE_URL" -ForegroundColor Gray
$CONFIRM = Read-Host "Proceed? (y/n)"
if ($CONFIRM -ne 'y') { Write-Host "Canceled."; exit }

# -----------------------------------------------------------------
# 3. ファイルのダウンロード (ソース -> ローカル一時フォルダ)
# -----------------------------------------------------------------
Write-Host "`n[1/2] Downloading assets from $SRC_NAME Storage..." -ForegroundColor Cyan

# ローカル一時保存フォルダのパス
$SAFE_FOLDER_NAME = $FOLDER_PATH -replace '[\\/:\*\?"<>\|]', '_'
$LOCAL_CACHE_DIR = "$TEMP_DIR/storage/${BUCKET_NAME}_${SAFE_FOLDER_NAME}"

# 既存のローカルキャッシュがあればクリーンアップして再作成
if (Test-Path $LOCAL_CACHE_DIR) { Remove-Item -Recurse -Force $LOCAL_CACHE_DIR }
New-Item -ItemType Directory -Path $LOCAL_CACHE_DIR | Out-Null

"Downloading from $SRC_STORAGE_URL" | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
# ★ --experimental フラグを追加
& supabase storage cp -r "$SRC_STORAGE_URL" "$LOCAL_CACHE_DIR" --experimental *>&1 | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8

# -----------------------------------------------------------------
# 4. ファイルのアップロード (ローカル一時フォルダ -> ターゲット)
# -----------------------------------------------------------------
Write-Host "`n[2/2] Uploading assets to $DST_NAME Storage..." -ForegroundColor Cyan

"Uploading to $DST_STORAGE_URL" | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
# ★ --experimental フラグを追加
& supabase storage cp -r "$LOCAL_CACHE_DIR" "$DST_STORAGE_URL" --experimental *>&1 | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8

"--- Storage Generic Sync Log Completed at $(Get-Date) ---" | Out-File -FilePath $LOG_FILE -Append -Encoding UTF8
Write-Host "`n--- Storage Sync Successfully Completed! ---" -ForegroundColor Green
Write-Host "Log file: $LOG_FILE" -ForegroundColor Gray