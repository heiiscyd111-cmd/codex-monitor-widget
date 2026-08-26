param([string]$Version = "")

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$package = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($Version)) { $Version = "v$($package.version)" }
if (-not $Version.StartsWith("v")) { $Version = "v$Version" }
$dist = Join-Path $projectRoot "dist"
if (Test-Path -LiteralPath $dist) {
  $resolvedDist = (Resolve-Path -LiteralPath $dist).Path
  if (-not $resolvedDist.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar)) { throw "Unsafe dist path: $resolvedDist" }
  Remove-Item -LiteralPath $resolvedDist -Recurse -Force
}
New-Item -ItemType Directory -Path $dist -Force | Out-Null
$electronDist = Join-Path $projectRoot "node_modules\electron\dist"
if (-not (Test-Path -LiteralPath (Join-Path $electronDist "electron.exe"))) { throw "Electron runtime missing. Run npm ci first." }
$portableName = "CodexMonitor-$Version-Windows-x64-Portable"
$portableDir = Join-Path $dist $portableName
Copy-Item -LiteralPath $electronDist -Destination $portableDir -Recurse -Force
Move-Item -LiteralPath (Join-Path $portableDir "electron.exe") -Destination (Join-Path $portableDir "CodexMonitor.exe")
$appDir = Join-Path $portableDir "resources\app"
New-Item -ItemType Directory -Path $appDir -Force | Out-Null
$appFiles = @("main.js","preload.js","index.html","tooltip.html","package.json","icon.png","icon.ico","set-codex-owner.ps1","watch-foreground.ps1","USAGE.zh-CN.txt","README.md","COMMERCIAL_USE.md","LICENSE")
foreach ($file in $appFiles) { Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $appDir $file) -Force }
$portableZip = Join-Path $dist "$portableName.zip"
Compress-Archive -LiteralPath $portableDir -DestinationPath $portableZip -CompressionLevel Optimal
$sourceName = "CodexMonitor-$Version-Source"
$sourceDir = Join-Path $dist $sourceName
New-Item -ItemType Directory -Path $sourceDir -Force | Out-Null
$sourceFiles = @("main.js","preload.js","index.html","tooltip.html","package.json","package-lock.json","icon.png","icon.ico","set-codex-owner.ps1","watch-foreground.ps1","USAGE.zh-CN.txt","README.md","COMMERCIAL_USE.md","LICENSE",".gitignore")
foreach ($file in $sourceFiles) {
  $sourcePath = Join-Path $projectRoot $file
  if (Test-Path -LiteralPath $sourcePath) { Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $sourceDir $file) -Force }
}
Copy-Item -LiteralPath (Join-Path $projectRoot "scripts") -Destination (Join-Path $sourceDir "scripts") -Recurse -Force
$sourceZip = Join-Path $dist "$sourceName.zip"
Compress-Archive -LiteralPath $sourceDir -DestinationPath $sourceZip -CompressionLevel Optimal
$checksums = @($portableZip,$sourceZip) | ForEach-Object {
  $stream = [IO.File]::OpenRead($_)
  try {
    $sha = [Security.Cryptography.SHA256]::Create()
    $hex = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
  } finally { $stream.Dispose() }
  "$hex  $([IO.Path]::GetFileName($_))"
}
[IO.File]::WriteAllLines((Join-Path $dist "SHA256SUMS.txt"),$checksums,[Text.UTF8Encoding]::new($false))
Get-Item -LiteralPath $portableZip,$sourceZip,(Join-Path $dist "SHA256SUMS.txt") | Select-Object Name,Length
