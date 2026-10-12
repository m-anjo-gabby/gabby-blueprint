<#
.SYNOPSIS
  export.ps1 で作成したアーカイブから、新しい端末に開発環境を構築する。

.DESCRIPTION
  ツールのインストール → Git 設定 → clone → 依存パッケージ → 資産の展開 → 証明書 の順に進める。
  済んでいる手順は自動でスキップするため、途中で止まっても再実行すれば続きから進められる。
  通常は同じフォルダの setup.cmd をダブルクリックして実行する。手順の詳細は docs/SETUP.md を参照。

.EXAMPLE
  .\setup.cmd
  .\setup.cmd -RepoPath D:\work\gabby-blueprint
#>
param(
  # 省略時は同じフォルダの *.gbenv（複数あれば最新）
  [string]$Archive,
  # 省略時はエクスポート元と同じパス（Claude Code のメモリを引き継ぐため、揃えることを推奨）
  [string]$RepoPath,
  # 確認をすべて「はい」で進める
  [switch]$Yes,
  # 省略時は対話入力
  [Security.SecureString]$Password
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'DevEnvCommon.ps1')

# winget / npm でインストールしたコマンドを、このウィンドウでもすぐ使えるようにする
function Update-SessionPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Test-Command([string]$Name) { return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

Write-Host ''
Write-Host 'Gabby Blueprint 開発環境セットアップ' -ForegroundColor Cyan

# ---------------------------------------------------------------------------
Write-Step '0. アーカイブの読み込み'
# ---------------------------------------------------------------------------
if (-not $Archive) {
  $found = Get-ChildItem -Path $PSScriptRoot -Filter '*.gbenv' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $found) { throw "アーカイブ（*.gbenv）が $PSScriptRoot に見つかりません。-Archive で指定してください。" }
  $Archive = $found.FullName
}
Write-Info "アーカイブ: $Archive"
$archiveBytes = [IO.File]::ReadAllBytes($Archive)

$entries = $null
for ($attempt = 1; -not $entries; $attempt++) {
  if (-not $Password) { $Password = Read-Host '  パスワード' -AsSecureString }
  try {
    $entries = Read-ZipBytes (Unprotect-DevEnvBytes $archiveBytes $Password)
  } catch {
    Write-Warn $_.Exception.Message
    $Password = $null
    if ($attempt -ge 3) { throw 'パスワードを3回間違えたため中止します。' }
  }
}
$manifestEntry = $entries | Where-Object { $_.Name -eq 'manifest.json' }
$manifest = [Text.Encoding]::UTF8.GetString($manifestEntry.Bytes) | ConvertFrom-Json
Write-Ok "作成日時 $($manifest.createdAt) / 作成元 $($manifest.sourceComputer) / ブランチ $($manifest.branch)"

if (-not $RepoPath) {
  $RepoPath = $manifest.repoPath
  if (-not $Yes) {
    $answer = Read-Host "  リポジトリの配置先 [$RepoPath]"
    if (-not [string]::IsNullOrWhiteSpace($answer)) { $RepoPath = $answer.Trim() }
  }
}
$RepoPath = [IO.Path]::GetFullPath($RepoPath)
Write-Info "配置先: $RepoPath"

# ---------------------------------------------------------------------------
Write-Step '1. ツールのインストール'
# ---------------------------------------------------------------------------
$tools = @(
  @{ Command = 'git';    Id = 'Git.Git';                    Name = 'Git' }
  @{ Command = 'node';   Id = 'OpenJS.NodeJS.LTS';          Name = 'Node.js LTS' }
  @{ Command = 'mkcert'; Id = 'FiloSottile.mkcert';         Name = 'mkcert（ローカルHTTPS証明書）' }
  @{ Command = 'code';   Id = 'Microsoft.VisualStudioCode'; Name = 'VSCode' }
)
$missingTools = @($tools | Where-Object { -not (Test-Command $_.Command) })
foreach ($tool in $tools) { if ($missingTools -notcontains $tool) { Write-Skip $tool.Name } }

if ($missingTools.Count -gt 0) {
  if (-not (Test-Command 'winget')) {
    throw 'winget が見つかりません。Microsoft Store で「アプリ インストーラー」を更新してから再実行してください。'
  }
  $names = ($missingTools | ForEach-Object { $_.Name }) -join ' / '
  if (-not (Confirm-Action "$names をインストールしますか？" -Yes:$Yes)) { throw '必要なツールがそろっていないため中止します。' }
  foreach ($tool in $missingTools) {
    Write-Info "$($tool.Name) をインストールしています..."
    Invoke-Native 'winget' @('install', '--id', $tool.Id, '-e', '--accept-source-agreements', '--accept-package-agreements')
  }
  Update-SessionPath
  foreach ($tool in $missingTools) {
    if (-not (Test-Command $tool.Command)) { throw "$($tool.Name) のインストール後もコマンドが見つかりません。PowerShell を開き直して再実行してください。" }
    Write-Ok $tool.Name
  }
}

$nodeVersion = [version]((& node -v).TrimStart('v'))
if ($nodeVersion -lt [version]'20.10.0') {
  throw "Node.js $nodeVersion は古いため使えません（20.10 以上が必要）。winget upgrade OpenJS.NodeJS.LTS で更新してください。"
}
Write-Ok "Node.js $nodeVersion"

# ---------------------------------------------------------------------------
Write-Step '2. Git の設定'
# ---------------------------------------------------------------------------
# リポジトリは LF で管理しているため、CRLF に変換しない。node_modules の長いパスも扱えるようにする
$gitSettings = [ordered]@{ 'core.autocrlf' = 'input'; 'core.longpaths' = 'true' }
if ($manifest.gitUserName) { $gitSettings['user.name'] = $manifest.gitUserName }
if ($manifest.gitUserEmail) { $gitSettings['user.email'] = $manifest.gitUserEmail }

foreach ($key in $gitSettings.Keys) {
  $current = & git config --global --get $key
  $wanted = $gitSettings[$key]
  if ($current -eq $wanted) { Write-Skip "$key = $wanted"; continue }
  # 名前・メールは既に設定されていれば尊重する
  if ($current -and $key -like 'user.*') { Write-Skip "$key = $current（既存の設定を使います）"; continue }
  if (Confirm-Action "git config --global $key を '$wanted' に設定しますか？（現在: $(if ($current) { $current } else { '未設定' })）" -Yes:$Yes) {
    Invoke-Native 'git' @('config', '--global', $key, $wanted)
    Write-Ok "$key = $wanted"
  }
}

# ---------------------------------------------------------------------------
Write-Step '3. ソースの取得'
# ---------------------------------------------------------------------------
if (Test-Path -LiteralPath (Join-Path $RepoPath '.git')) {
  Write-Skip "clone 済み（$RepoPath）"
} else {
  if ((Test-Path -LiteralPath $RepoPath) -and (Get-ChildItem -LiteralPath $RepoPath -Force | Select-Object -First 1)) {
    throw "$RepoPath は空でないフォルダです。別の配置先を -RepoPath で指定してください。"
  }
  Write-Info "$($manifest.remoteUrl) を clone しています（初回は GitHub へのサインイン画面が開きます）..."
  New-Item -ItemType Directory -Force (Split-Path -Parent $RepoPath) | Out-Null
  Invoke-Native 'git' @('clone', $manifest.remoteUrl, $RepoPath)
  Write-Ok 'clone しました。'
}

$currentBranch = & git -C $RepoPath rev-parse --abbrev-ref HEAD
if ($currentBranch -eq $manifest.branch) {
  Write-Skip "ブランチ $currentBranch"
} else {
  $remoteBranch = & git -C $RepoPath ls-remote --heads origin $manifest.branch
  if (-not $remoteBranch) {
    Write-Warn "ブランチ $($manifest.branch) が GitHub にありません（エクスポート元で push されていない可能性があります）。$currentBranch のまま続けます。"
  } elseif (Confirm-Action "ブランチ $($manifest.branch) に切り替えますか？（現在: $currentBranch）" -Yes:$Yes) {
    Invoke-Native 'git' @('-C', $RepoPath, 'switch', $manifest.branch)
    Write-Ok "ブランチ $($manifest.branch)"
  }
}

# ---------------------------------------------------------------------------
Write-Step '4. pnpm と依存パッケージ'
# ---------------------------------------------------------------------------
$packageJson = Get-Content -Raw -Encoding UTF8 (Join-Path $RepoPath 'package.json') | ConvertFrom-Json
$pnpmVersion = $packageJson.packageManager -replace '^pnpm@', ''
$installedPnpm = if (Test-Command 'pnpm') { (& pnpm -v) } else { $null }
if ($installedPnpm -eq $pnpmVersion) {
  Write-Skip "pnpm $pnpmVersion"
} elseif (Confirm-Action "pnpm $pnpmVersion をインストールしますか？（現在: $(if ($installedPnpm) { $installedPnpm } else { '未インストール' })）" -Yes:$Yes) {
  Invoke-Native 'npm' @('install', '-g', "pnpm@$pnpmVersion")
  Update-SessionPath
  Write-Ok "pnpm $pnpmVersion"
}

Write-Info 'pnpm install を実行しています（初回は数分かかります）...'
Push-Location $RepoPath
try { Invoke-Native 'pnpm' @('install', '--frozen-lockfile') } finally { Pop-Location }
Write-Ok '依存パッケージをインストールしました。'

# ---------------------------------------------------------------------------
Write-Step '5. 環境ファイル等の展開'
# ---------------------------------------------------------------------------
function Show-RestoreResult([string]$Label, [string]$Result) {
  switch ($Result) {
    'created' { Write-Ok $Label }
    'updated' { Write-Ok "$Label（上書き）" }
    'same'    { Write-Skip $Label }
    'kept'    { Write-Warn "$Label（既存のファイルを残しました）" }
  }
}

foreach ($entry in $entries | Where-Object { $_.Name.StartsWith('repo/') }) {
  $relative = $entry.Name.Substring('repo/'.Length)
  $destination = Join-Path $RepoPath ($relative.Replace('/', '\'))
  Show-RestoreResult $relative (Restore-File $destination $entry.Bytes -Yes:$Yes)
}

# ---------------------------------------------------------------------------
Write-Step '6. Claude Code のメモリ'
# ---------------------------------------------------------------------------
$memoryEntries = @($entries | Where-Object { $_.Name.StartsWith('claude-memory/') })
if ($memoryEntries.Count -eq 0) {
  Write-Skip 'アーカイブにメモリはありません。'
} else {
  $memoryDir = Join-Path (Get-ClaudeProjectsRoot) "$(Get-ClaudeProjectKey $RepoPath)\memory"
  Write-Info "展開先: $memoryDir"
  foreach ($entry in $memoryEntries) {
    $relative = $entry.Name.Substring('claude-memory/'.Length)
    $destination = Join-Path $memoryDir ($relative.Replace('/', '\'))
    Show-RestoreResult $relative (Restore-File $destination $entry.Bytes -Yes:$Yes)
  }
}

# ---------------------------------------------------------------------------
Write-Step '7. ローカルHTTPS証明書'
# ---------------------------------------------------------------------------
# 証明書は端末ごとのルートCAで発行するため、コピーせずここで作る
$caRoot = (& mkcert -CAROOT).Trim()
if (Test-Path -LiteralPath (Join-Path $caRoot 'rootCA.pem')) {
  Write-Skip "ルートCA（$caRoot）"
} else {
  Write-Info 'ルートCAを作成して Windows に登録します（確認ダイアログが出たら「はい」を選んでください）。'
  Invoke-Native 'mkcert' @('-install')
  Write-Ok 'ルートCAを登録しました。'
}
foreach ($app in @('admin', 'coach', 'student')) {
  $certDir = Join-Path $RepoPath "apps\$app\certificates"
  $keyFile = Join-Path $certDir 'localhost-key.pem'
  $certFile = Join-Path $certDir 'localhost.pem'
  if ((Test-Path -LiteralPath $keyFile) -and (Test-Path -LiteralPath $certFile)) { Write-Skip "apps/$app"; continue }
  New-Item -ItemType Directory -Force $certDir | Out-Null
  Invoke-Native 'mkcert' @('-key-file', $keyFile, '-cert-file', $certFile, 'localhost', '127.0.0.1', '::1')
  Write-Ok "apps/$app"
}

# ---------------------------------------------------------------------------
Write-Step '8. VSCode の拡張機能'
# ---------------------------------------------------------------------------
$extensionsFile = Join-Path $RepoPath '.vscode\extensions.json'
$recommended = if (Test-Path -LiteralPath $extensionsFile) {
  (Get-Content -Raw -Encoding UTF8 $extensionsFile | ConvertFrom-Json).recommendations
} else { @() }
$installedExtensions = @(& code --list-extensions) | ForEach-Object { $_.ToLower() }
$missingExtensions = @($recommended | Where-Object { $installedExtensions -notcontains $_.ToLower() })
if (-not (Test-Path -LiteralPath $extensionsFile)) {
  Write-Warn '.vscode/extensions.json がないためスキップしました（作業ブランチに push されているか確認してください）。'
} elseif ($missingExtensions.Count -eq 0) {
  Write-Skip '推奨拡張機能はすべてインストール済みです。'
} elseif (Confirm-Action "推奨拡張機能 $($missingExtensions.Count) 件（$($missingExtensions -join ', ')）をインストールしますか？" -Yes:$Yes) {
  foreach ($extension in $missingExtensions) { Invoke-Native 'code' @('--install-extension', $extension) }
  Write-Ok '拡張機能をインストールしました。'
}

# ---------------------------------------------------------------------------
Write-Step '9. E2E テスト用ブラウザ（任意）'
# ---------------------------------------------------------------------------
if (Confirm-Action 'Playwright のブラウザ（chromium / webkit）を取得しますか？ E2E を実行しない場合は不要です。' $false -Yes:$Yes) {
  Push-Location $RepoPath
  try { Invoke-Native 'pnpm' @('--filter', '@gabby/testing', 'exec', 'playwright', 'install', 'chromium', 'webkit') }
  finally { Pop-Location }
  Write-Ok 'ブラウザを取得しました。'
} else {
  Write-Skip 'スキップしました（後から docs/SETUP.md の手順9で取得できます）。'
}

# ---------------------------------------------------------------------------
Write-Step '10. CV辞書ツール用の Python（任意）'
# ---------------------------------------------------------------------------
# python が Microsoft Store への案内（App Execution Alias）の場合もあるため、実際に起動できるかで判定する
function Test-PythonModule([string]$Module) {
  try { & python -c "import $Module" 2>$null; return $LASTEXITCODE -eq 0 } catch { return $false }
}
$hasPython = Test-PythonModule 'sys'
if ($hasPython -and (Test-PythonModule 'openpyxl')) {
  Write-Skip 'Python と openpyxl はインストール済みです。'
} elseif (Confirm-Action 'CV辞書の確認依頼Excelを出力するための Python と openpyxl をインストールしますか？ CV辞書の作業をしない場合は不要です。' $false -Yes:$Yes) {
  if (-not $hasPython) {
    Write-Info 'Python をインストールしています...'
    Invoke-Native 'winget' @('install', '--id', 'Python.Python.3.14', '-e', '--accept-source-agreements', '--accept-package-agreements')
    Update-SessionPath
    if (-not (Test-PythonModule 'sys')) { throw 'Python のインストール後も起動できません。PowerShell を開き直して再実行してください。' }
  }
  Invoke-Native 'python' @('-m', 'pip', 'install', '--user', 'openpyxl')
  Write-Ok 'Python と openpyxl をインストールしました。'
} else {
  Write-Skip 'スキップしました（後から docs/SETUP.md の手順10でインストールできます）。'
}

# ---------------------------------------------------------------------------
Write-Host ''
Write-Host 'セットアップが完了しました。' -ForegroundColor Green
Write-Host ''
Write-Host '動作確認:' -ForegroundColor Cyan
Write-Info "1. cd $RepoPath"
Write-Info '2. pnpm dev:ssl'
Write-Info '3. https://localhost:3000（student）/ 3001（admin）/ 3002（coach）でログインできることを確認'
Write-Host ''
Write-Host '手動で行うこと:' -ForegroundColor Cyan
Write-Info '- VSCode の Claude Code でサインインする（メモリは引き継ぎ済み）'
Write-Info '- VSCode の設定を引き継ぐ場合は、VSCode の「設定の同期」を有効にする'
Write-Info '- このアーカイブを持ち運んだ媒体からフォルダを削除する'
Write-Host ''
if (Confirm-Action 'VSCode でリポジトリを開きますか？' -Yes:$Yes) { & code $RepoPath }
