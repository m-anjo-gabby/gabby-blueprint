# 開発環境の引き継ぎツール（export.ps1 / setup.ps1）の共通処理。
# Windows 標準の PowerShell 5.1 だけで動くように、外部ツール（7-Zip 等）は使わない。
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# ---------------------------------------------------------------------------
# 引き継ぐ資産（リポジトリ直下からの相対パス。フォルダは中身をすべて含める）
# ---------------------------------------------------------------------------
$script:DevEnvRepoAssets = @(
  @{ Path = 'apps/admin/.env.local';           Required = $true;  Note = 'admin の dev 接続' }
  @{ Path = 'apps/coach/.env.local';           Required = $true;  Note = 'coach の dev 接続' }
  @{ Path = 'apps/student/.env.local';         Required = $true;  Note = 'student の dev 接続' }
  @{ Path = 'apps/admin/.env.staging';         Required = $false; Note = 'admin の staging 接続' }
  @{ Path = 'apps/coach/.env.staging';         Required = $false; Note = 'coach の staging 接続' }
  @{ Path = 'apps/student/.env.staging';       Required = $false; Note = 'student の staging 接続' }
  @{ Path = 'testing/.env.local';              Required = $false; Note = 'E2E 用' }
  @{ Path = 'supabase/release/env/.env.dev';     Required = $false; Note = 'リリース作業（dev）' }
  @{ Path = 'supabase/release/env/.env.staging'; Required = $false; Note = 'リリース作業（staging）' }
  @{ Path = 'supabase/release/env/.env.prod';    Required = $false; Note = 'リリース作業（prod）' }
  @{ Path = '.vercel';                         Required = $false; Note = 'Vercel CLI のプロジェクト紐づけ' }
  @{ Path = 'apps/admin/.vercel';              Required = $false; Note = 'Vercel CLI のプロジェクト紐づけ（admin）' }
  @{ Path = '.github';                         Required = $false; Note = 'Copilot 指示ファイル等（Git管理外）' }
)

# 引き継がない Git 管理外ファイル（export 時の「未知のファイル」警告から除外する）
# どの階層にあっても対象外（ファイル名の末尾一致、'/' で終わるものはフォルダ名の一致）
$script:DevEnvIgnoredAnywhere = @(
  'node_modules/', '.next/', '.turbo/', 'next-env.d.ts', '.tsbuildinfo', 'test-results/', 'playwright-report/',
  'certificates/'           # 端末ごとに mkcert で作り直す
)
# リポジトリ直下からのパスで指定（完全一致）
$script:DevEnvIgnoredPaths = @(
  '.env.local',             # 古いプロジェクトを指しており使わない
  'temp_data/', 'scripts/temp_data/',   # 本番データを含むため持ち出さない
  'repomix-output.xml', 'supabase/.temp/', 'supabase/release/logs/',
  'testing/e2e/.artifacts/', 'testing/e2e/.auth/',
  '.claude/worktrees/'      # Claude Code の作業用コピー
)

$script:ArchiveMagic = [Text.Encoding]::ASCII.GetBytes('GBENV1')
$script:Pbkdf2Iterations = 300000

# ---------------------------------------------------------------------------
# 画面表示
# ---------------------------------------------------------------------------
function Write-Step([string]$Title) {
  Write-Host ''
  Write-Host "==== $Title ====" -ForegroundColor Cyan
}
function Write-Ok([string]$Message)   { Write-Host "  [OK]   $Message" -ForegroundColor Green }
function Write-Skip([string]$Message) { Write-Host "  [済み] $Message" -ForegroundColor DarkGray }
function Write-Warn([string]$Message) { Write-Host "  [注意] $Message" -ForegroundColor Yellow }
function Write-Info([string]$Message) { Write-Host "         $Message" }

function Confirm-Action([string]$Question, [bool]$Default = $true, [switch]$Yes) {
  if ($Yes) { return $true }
  $hint = if ($Default) { '[Y/n]' } else { '[y/N]' }
  $answer = Read-Host "  $Question $hint"
  if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
  return $answer.Trim().ToLower() -in @('y', 'yes')
}

# 外部コマンドを実行し、失敗したら止める
function Invoke-Native([string]$FilePath, [string[]]$Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "コマンドが失敗しました（終了コード $LASTEXITCODE）: $FilePath $($Arguments -join ' ')" }
}

# ---------------------------------------------------------------------------
# パスワード付き暗号化（AES-256-CBC + HMAC-SHA256、鍵は PBKDF2-SHA256 で導出）
# 形式: magic(6) | salt(16) | iv(16) | 暗号文 | HMAC(32)  ※HMAC は magic〜暗号文が対象
# ---------------------------------------------------------------------------
function Read-Password([string]$Prompt, [switch]$Confirm) {
  while ($true) {
    $first = Read-Host "  $Prompt" -AsSecureString
    if ($first.Length -lt 12) { Write-Warn 'パスワードは12文字以上にしてください。'; continue }
    if (-not $Confirm) { return $first }
    $second = Read-Host '  確認のためもう一度入力してください' -AsSecureString
    if ((ConvertTo-PlainText $first) -ceq (ConvertTo-PlainText $second)) { return $first }
    Write-Warn 'パスワードが一致しません。もう一度入力してください。'
  }
}

function ConvertTo-PlainText([Security.SecureString]$Secure) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Get-DerivedKeys([Security.SecureString]$Password, [byte[]]$Salt) {
  $passwordBytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-PlainText $Password))
  $kdf = [Security.Cryptography.Rfc2898DeriveBytes]::new(
    $passwordBytes, $Salt, $script:Pbkdf2Iterations, [Security.Cryptography.HashAlgorithmName]::SHA256)
  try { return @{ Enc = $kdf.GetBytes(32); Mac = $kdf.GetBytes(32) } }
  finally { $kdf.Dispose(); [Array]::Clear($passwordBytes, 0, $passwordBytes.Length) }
}

function Get-RandomBytes([int]$Count) {
  $bytes = New-Object byte[] $Count
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return , $bytes
}

function Get-Hmac([byte[]]$Key, [byte[]]$Data, [int]$Length) {
  $hmac = [Security.Cryptography.HMACSHA256]::new($Key)
  try { return , $hmac.ComputeHash($Data, 0, $Length) } finally { $hmac.Dispose() }
}

function Protect-DevEnvBytes([byte[]]$Plain, [Security.SecureString]$Password) {
  $salt = Get-RandomBytes 16
  $iv = Get-RandomBytes 16
  $keys = Get-DerivedKeys $Password $salt
  $aes = [Security.Cryptography.Aes]::Create()
  try {
    $aes.Mode = [Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [Security.Cryptography.PaddingMode]::PKCS7
    $encryptor = $aes.CreateEncryptor($keys.Enc, $iv)
    $cipher = $encryptor.TransformFinalBlock($Plain, 0, $Plain.Length)
  } finally { $aes.Dispose() }

  $out = New-Object IO.MemoryStream
  foreach ($part in @($script:ArchiveMagic, $salt, $iv, $cipher)) { $out.Write($part, 0, $part.Length) }
  $body = $out.ToArray()
  $mac = Get-Hmac $keys.Mac $body $body.Length
  $out.Write($mac, 0, $mac.Length)
  return , $out.ToArray()
}

function Unprotect-DevEnvBytes([byte[]]$Data, [Security.SecureString]$Password) {
  $headerLength = $script:ArchiveMagic.Length + 32
  if ($Data.Length -lt $headerLength + 16 + 32) { throw 'アーカイブの形式が正しくありません。' }
  for ($i = 0; $i -lt $script:ArchiveMagic.Length; $i++) {
    if ($Data[$i] -ne $script:ArchiveMagic[$i]) { throw 'アーカイブの形式が正しくありません（export.ps1 で作成したファイルを指定してください）。' }
  }
  $salt = [byte[]]$Data[6..21]
  $iv = [byte[]]$Data[22..37]
  $bodyLength = $Data.Length - 32
  $keys = Get-DerivedKeys $Password $salt

  $expected = Get-Hmac $keys.Mac $Data $bodyLength
  $diff = 0
  for ($i = 0; $i -lt 32; $i++) { $diff = $diff -bor ($expected[$i] -bxor $Data[$bodyLength + $i]) }
  if ($diff -ne 0) { throw 'パスワードが違うか、アーカイブが壊れています。' }

  $aes = [Security.Cryptography.Aes]::Create()
  try {
    $aes.Mode = [Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [Security.Cryptography.PaddingMode]::PKCS7
    $decryptor = $aes.CreateDecryptor($keys.Enc, $iv)
    return , $decryptor.TransformFinalBlock($Data, $headerLength, $bodyLength - $headerLength)
  } finally { $aes.Dispose() }
}

# ---------------------------------------------------------------------------
# ZIP（メモリ上で作成・展開する。平文のアーカイブをディスクに残さないため）
# ---------------------------------------------------------------------------
# $Entries: @{ Name = 'repo/apps/admin/.env.local'; Bytes = [byte[]] } の配列
function New-ZipBytes($Entries) {
  $stream = New-Object IO.MemoryStream
  $zip = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
  try {
    foreach ($entry in $Entries) {
      $zipEntry = $zip.CreateEntry($entry.Name, [IO.Compression.CompressionLevel]::Optimal)
      $writer = $zipEntry.Open()
      try { $writer.Write($entry.Bytes, 0, $entry.Bytes.Length) } finally { $writer.Dispose() }
    }
  } finally { $zip.Dispose() }
  return , $stream.ToArray()
}

function Read-ZipBytes([byte[]]$Data) {
  $stream = New-Object IO.MemoryStream(, $Data)
  $zip = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Read)
  try {
    $result = New-Object System.Collections.Generic.List[object]
    foreach ($zipEntry in $zip.Entries) {
      if ($zipEntry.Name -eq '') { continue }   # フォルダ
      $reader = $zipEntry.Open()
      $buffer = New-Object IO.MemoryStream
      try { $reader.CopyTo($buffer) } finally { $reader.Dispose() }
      $result.Add(@{ Name = $zipEntry.FullName; Bytes = $buffer.ToArray() })
    }
    return , $result
  } finally { $zip.Dispose() }
}

# ---------------------------------------------------------------------------
# 復元
# ---------------------------------------------------------------------------
# 同じ内容ならスキップ、違う場合は上書きを確認する。戻り値: 'created' / 'updated' / 'same' / 'kept'
function Restore-File([string]$Destination, [byte[]]$Bytes, [switch]$Yes) {
  if (Test-Path -LiteralPath $Destination) {
    $current = [IO.File]::ReadAllBytes($Destination)
    if ([Convert]::ToBase64String($current) -eq [Convert]::ToBase64String($Bytes)) { return 'same' }
    if (-not (Confirm-Action "$Destination は内容が異なります。上書きしますか？" $false -Yes:$Yes)) { return 'kept' }
    [IO.File]::WriteAllBytes($Destination, $Bytes)
    return 'updated'
  }
  New-Item -ItemType Directory -Force (Split-Path -Parent $Destination) | Out-Null
  [IO.File]::WriteAllBytes($Destination, $Bytes)
  return 'created'
}

# Claude Code がプロジェクトごとのデータ（メモリ等）を置くフォルダ名。
# パスの英数字以外を '-' に置き換えたもの（例: c:\react\gabby-blueprint → c--react-gabby-blueprint）。
function Get-ClaudeProjectKey([string]$RepoPath) {
  $full = [IO.Path]::GetFullPath($RepoPath).TrimEnd('\')
  # VSCode 拡張機能はドライブ文字を小文字で渡すため、それに合わせる
  $full = $full.Substring(0, 1).ToLower() + $full.Substring(1)
  return ($full -replace '[^A-Za-z0-9]', '-')
}

function Get-ClaudeProjectsRoot { return Join-Path $env:USERPROFILE '.claude\projects' }
