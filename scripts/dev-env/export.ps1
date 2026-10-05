<#
.SYNOPSIS
  Git 管理外の開発資産（.env 類・Claude Code のメモリ等）を、パスワード付きの暗号化アーカイブにまとめる。

.DESCRIPTION
  出力フォルダには、アーカイブと別端末用のセットアップツール（setup.cmd / setup.ps1）が入る。
  フォルダごと別端末に持っていき、setup.cmd を実行すると環境構築を対話形式で進められる。
  手順の詳細は docs/SETUP.md を参照。

.EXAMPLE
  pnpm env:export
  pnpm env:export -- -OutDir D:\transfer
#>
param(
  # 出力先（既定: デスクトップ）。リポジトリ内は指定できない
  [string]$OutDir = [Environment]::GetFolderPath('Desktop'),
  # 確認をすべて既定の回答で進める（コミット漏れ等があっても続行する）
  [switch]$Yes,
  # 省略時は対話入力
  [Security.SecureString]$Password
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'DevEnvCommon.ps1')

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

# git の標準エラー（長いパスの警告等）で止まらないように、失敗判定は終了コードで行う
function Get-GitOutput([string[]]$Arguments) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $output = & git -C $repoRoot -c core.longpaths=true @Arguments 2>$null }
  finally { $ErrorActionPreference = $previous }
  if ($LASTEXITCODE -ne 0) { return $null }
  return $output
}

Write-Host ''
Write-Host 'Gabby Blueprint 開発環境エクスポート' -ForegroundColor Cyan
Write-Info "リポジトリ: $repoRoot"

# ---------------------------------------------------------------------------
Write-Step '1. Git の状態確認'
# 別端末では GitHub から clone するため、push していない作業は引き継がれない
# ---------------------------------------------------------------------------
$branch = Get-GitOutput @('rev-parse', '--abbrev-ref', 'HEAD')
$remoteUrl = Get-GitOutput @('remote', 'get-url', 'origin')
Write-Info "ブランチ: $branch"

$hasProblem = $false
$dirty = @(Get-GitOutput @('status', '--porcelain'))
if ($dirty.Count -gt 0 -and $dirty[0]) {
  Write-Warn "コミットしていない変更が $($dirty.Count) 件あります（別端末には引き継がれません）。"
  $hasProblem = $true
}
$upstream = Get-GitOutput @('rev-parse', '--abbrev-ref', '@{u}')
if (-not $upstream) {
  Write-Warn "ブランチ $branch は GitHub に push されていません。"
  $hasProblem = $true
} else {
  $ahead = [int](Get-GitOutput @('rev-list', '--count', '@{u}..HEAD'))
  if ($ahead -gt 0) {
    Write-Warn "push していないコミットが $ahead 件あります。"
    $hasProblem = $true
  }
}
if ($hasProblem) {
  if (-not (Confirm-Action 'このまま続けますか？（先に commit / push することを推奨します）' $false -Yes:$Yes)) { exit 1 }
} else {
  Write-Ok 'コミット・push 済みです。'
}

# ---------------------------------------------------------------------------
Write-Step '2. 引き継ぐファイルの収集'
# ---------------------------------------------------------------------------
$entries = New-Object System.Collections.Generic.List[object]
$missingRequired = @()

foreach ($asset in $script:DevEnvRepoAssets) {
  $source = Join-Path $repoRoot $asset.Path
  if (-not (Test-Path -LiteralPath $source)) {
    if ($asset.Required) { $missingRequired += $asset.Path; Write-Warn "$($asset.Path) がありません（必須）" }
    else { Write-Info "-      $($asset.Path)（なし）" }
    continue
  }
  $files = if ((Get-Item -LiteralPath $source -Force).PSIsContainer) {
    Get-ChildItem -LiteralPath $source -Recurse -File -Force
  } else { Get-Item -LiteralPath $source -Force }
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
    $entries.Add(@{ Name = "repo/$relative"; Bytes = [IO.File]::ReadAllBytes($file.FullName) })
  }
  Write-Ok "$($asset.Path)（$($asset.Note)）"
}
if ($missingRequired.Count -gt 0) {
  if (-not (Confirm-Action '必須ファイルが不足しています。このまま続けますか？' $false -Yes:$Yes)) { exit 1 }
}

# Claude Code のメモリ
$claudeKey = Get-ClaudeProjectKey $repoRoot
$memoryDir = Join-Path (Get-ClaudeProjectsRoot) "$claudeKey\memory"
$memoryCount = 0
if (Test-Path -LiteralPath $memoryDir) {
  foreach ($file in Get-ChildItem -LiteralPath $memoryDir -Recurse -File -Force) {
    $relative = $file.FullName.Substring($memoryDir.Length + 1).Replace('\', '/')
    $entries.Add(@{ Name = "claude-memory/$relative"; Bytes = [IO.File]::ReadAllBytes($file.FullName) })
    $memoryCount++
  }
  Write-Ok "Claude Code のメモリ（$memoryCount ファイル）"
} else {
  Write-Info "-      Claude Code のメモリ（なし: $memoryDir）"
}

# 一覧にない Git 管理外ファイルがあれば知らせる（引き継ぎ漏れの検知用）
$ignored = @(Get-GitOutput @('ls-files', '--others', '--ignored', '--exclude-standard', '--directory'))
$unknown = $ignored | Where-Object {
  $path = $_
  if (-not $path) { return $false }
  $isAsset = $script:DevEnvRepoAssets | Where-Object { $path -eq $_.Path -or $path.StartsWith("$($_.Path)/") }
  $isKnown = ($script:DevEnvIgnoredPaths -contains $path) -or ($script:DevEnvIgnoredAnywhere | Where-Object { $path.EndsWith($_) -or ($_.EndsWith('/') -and ($path.StartsWith($_) -or $path.Contains("/$_"))) })
  -not $isAsset -and -not $isKnown
}
if ($unknown) {
  Write-Warn '次の Git 管理外ファイルは引き継ぎ対象外です（必要なら DevEnvCommon.ps1 の一覧に追加してください）:'
  $unknown | ForEach-Object { Write-Info "- $_" }
}

# ---------------------------------------------------------------------------
Write-Step '3. アーカイブの作成'
# ---------------------------------------------------------------------------
$outFull = [IO.Path]::GetFullPath($OutDir)
if ($outFull.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "出力先にリポジトリ内（$outFull）は指定できません。"
}

$manifest = [ordered]@{
  formatVersion  = 1
  createdAt      = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
  sourceComputer = $env:COMPUTERNAME
  repoPath       = $repoRoot
  remoteUrl      = $remoteUrl
  branch         = $branch
  gitUserName    = (Get-GitOutput @('config', 'user.name'))
  gitUserEmail   = (Get-GitOutput @('config', 'user.email'))
  files          = @($entries | ForEach-Object { $_.Name })
}
$manifestJson = $manifest | ConvertTo-Json -Depth 4
$entries.Insert(0, @{ Name = 'manifest.json'; Bytes = [Text.Encoding]::UTF8.GetBytes($manifestJson) })

Write-Info 'アーカイブは .env のシークレットを含みます。パスワードで暗号化します。'
Write-Info 'パスワードは別端末での展開時に必要です（アーカイブと同じ場所にメモしないでください）。'
if (-not $Password) { $Password = Read-Password 'パスワード（12文字以上）' -Confirm }

$zipBytes = New-ZipBytes $entries
$encrypted = Protect-DevEnvBytes $zipBytes $Password

$bundleDir = Join-Path $outFull ("gabby-dev-env-" + (Get-Date).ToString('yyyyMMdd-HHmm'))
New-Item -ItemType Directory -Force $bundleDir | Out-Null
[IO.File]::WriteAllBytes((Join-Path $bundleDir 'gabby-dev-env.gbenv'), $encrypted)
foreach ($tool in @('setup.cmd', 'setup.ps1', 'DevEnvCommon.ps1')) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $tool) -Destination $bundleDir -Force
}

Write-Ok "作成しました: $bundleDir"
Write-Info "（ファイル $($entries.Count - 1) 件 / $([Math]::Round($encrypted.Length / 1KB)) KB）"
Write-Host ''
Write-Host '次の手順:' -ForegroundColor Cyan
Write-Info '1. 上のフォルダを USB メモリや個人のクラウドストレージで別端末にコピーする'
Write-Info '2. 別端末でフォルダ内の setup.cmd をダブルクリックして、画面の指示に従う'
Write-Info '3. 引き継ぎが終わったら、コピーに使った媒体からフォルダを削除する'
