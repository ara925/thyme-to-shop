param([switch]$RecoveryOnly)
$ErrorActionPreference = 'Stop'
if (-not $RecoveryOnly) { throw 'The WordPress integration is retired. Package the independent app with scripts/package-shopify-app.ps1. Use -RecoveryOnly only to archive legacy source; do not install it.' }
$repoRoot = Split-Path -Parent $PSScriptRoot
$pluginPath = Join-Path $repoRoot 'wordpress\place-in-thyme-meal-rotation'
$outputPath = Join-Path $repoRoot 'dist\place-in-thyme-meal-rotation.zip'
New-Item -ItemType Directory -Path (Split-Path -Parent $outputPath) -Force | Out-Null
Compress-Archive -LiteralPath $pluginPath -DestinationPath $outputPath -Force
Write-Output $outputPath
