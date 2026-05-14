Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
$webEnvFile = Join-Path $rootDir "apps/web/.env.local"
$mobileEnvFile = Join-Path $rootDir "apps/mobile/.env"
$mobileAppJson = Join-Path $rootDir "apps/mobile/app.json"

function Read-Default([string]$Label, [string]$Default) {
  $v = Read-Host "$Label [$Default]"
  if ([string]::IsNullOrWhiteSpace($v)) { return $Default }
  return $v
}

function Slugify([string]$v) {
  $s = $v.ToLowerInvariant()
  $s = [System.Text.RegularExpressions.Regex]::Replace($s, "[^a-z0-9]+", "-")
  $s = $s.Trim("-")
  if ([string]::IsNullOrWhiteSpace($s)) { return "app" }
  return $s
}

Write-Host "=== MesSmini App Setup Wizard ==="

$appName = Read-Default "APP_NAME" "AMoon Eclipse"
$appId = Read-Default "APP_ID" "official"
$apiBase = Read-Default "API_BASE_URL" "http://localhost:8080"
$defaultWs = $apiBase -replace "^http", "ws"
$wsBase = Read-Default "WS_BASE_URL" $defaultWs
$androidPackage = Read-Default "Android package" "com.amoon.eclipse"
$iosBundleId = Read-Default "iOS bundleIdentifier" "com.amoon.eclipse"
$slugDefault = Slugify $appName
$appScheme = Read-Default "Deep link scheme" $slugDefault
$appSlug = Read-Default "Expo slug" $slugDefault

@(
  "VITE_APP_ID=$appId"
  "VITE_API_BASE_URL=$apiBase"
  "VITE_WS_BASE_URL=$wsBase"
  "VITE_APP_NAME=$appName"
) | Set-Content -Path $webEnvFile -Encoding UTF8
Write-Host "Đã ghi $webEnvFile"

@(
  "EXPO_PUBLIC_APP_ID=$appId"
  "EXPO_PUBLIC_API_URL=$apiBase"
  "EXPO_PUBLIC_WS_BASE_URL=$wsBase"
  "EXPO_PUBLIC_APP_NAME=$appName"
) | Set-Content -Path $mobileEnvFile -Encoding UTF8
Write-Host "Đã ghi $mobileEnvFile"

$appJson = Get-Content $mobileAppJson -Raw | ConvertFrom-Json
if (-not $appJson.expo) { $appJson | Add-Member -NotePropertyName expo -NotePropertyValue (@{}) }
$appJson.expo.name = $appName
$appJson.expo.slug = $appSlug
$appJson.expo.scheme = $appScheme
if (-not $appJson.expo.android) { $appJson.expo | Add-Member -NotePropertyName android -NotePropertyValue (@{}) }
$appJson.expo.android.package = $androidPackage
if (-not $appJson.expo.ios) { $appJson.expo | Add-Member -NotePropertyName ios -NotePropertyValue (@{}) }
$appJson.expo.ios.bundleIdentifier = $iosBundleId
$appJson | ConvertTo-Json -Depth 100 | Set-Content -Path $mobileAppJson -Encoding UTF8
Write-Host "Đã update $mobileAppJson"

$target = Read-Default "Build target (none|web|desktop|apk)" "none"
switch ($target.ToLowerInvariant()) {
  "web" { Push-Location $rootDir; npm run build --workspace=apps/web; Pop-Location }
  "desktop" { Push-Location $rootDir; npm run build --workspace=apps/desktop; Pop-Location }
  "apk" { Push-Location $rootDir; npm run build:apk --workspace=apps/mobile; Pop-Location }
  default { }
}

Write-Host "Xong."
