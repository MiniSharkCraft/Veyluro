Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $rootDir "packages/server"
$envFile = Join-Path $serverDir ".env"

function Read-Default([string]$Label, [string]$Default) {
  $v = Read-Host "$Label [$Default]"
  if ([string]::IsNullOrWhiteSpace($v)) { return $Default }
  return $v
}

function Read-Required([string]$Label) {
  while ($true) {
    $v = Read-Host $Label
    if (-not [string]::IsNullOrWhiteSpace($v)) { return $v }
  }
}

function New-Hex32() {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return ([BitConverter]::ToString($bytes) -replace "-", "").ToLowerInvariant()
}

Write-Host "=== MesSmini Server Setup Wizard ==="

$port = Read-Default "PORT" "8080"
$envName = Read-Default "ENV (development|production)" "production"
$dbDsn = Read-Required "DB_DSN (mysql://... hoặc user:pass@tcp(host:3306)/db?parseTime=true)"
$jwtSecret = Read-Required "JWT_SECRET"
$dbEncryptionKey = Read-Default "DB_ENCRYPTION_KEY (64 hex)" (New-Hex32)
$dbHmacKey = Read-Default "DB_HMAC_KEY (64 hex)" (New-Hex32)
$allowedOrigins = Read-Default "ALLOWED_ORIGINS (comma-separated)" "*"
$hmacSigningKey = Read-Default "HMAC_SIGNING_KEY (optional, để trống = disable integrity)" ""
$expectedAppSums = Read-Default "EXPECTED_APP_SUMS (optional, comma-separated)" ""

New-Item -ItemType Directory -Force -Path $serverDir | Out-Null

$content = @(
  "PORT=$port"
  "ENV=$envName"
  "DB_DSN=$dbDsn"
  "JWT_SECRET=$jwtSecret"
  "DB_ENCRYPTION_KEY=$dbEncryptionKey"
  "DB_HMAC_KEY=$dbHmacKey"
  "ALLOWED_ORIGINS=$allowedOrigins"
  "HMAC_SIGNING_KEY=$hmacSigningKey"
  "EXPECTED_APP_SUMS=$expectedAppSums"
)

$content | Set-Content -Path $envFile -Encoding UTF8
Write-Host "Đã ghi config: $envFile"

$buildNow = Read-Default "Build server ngay? (y/n)" "y"
if ($buildNow -match "^[Yy]$") {
  & (Join-Path $serverDir "build.sh")
}

Write-Host "Xong."
