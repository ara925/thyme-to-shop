$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$appPath = Join-Path $repoRoot 'shopify-app'
$outputPath = Join-Path $repoRoot 'dist\place-in-thyme-shopify-app.zip'
New-Item -ItemType Directory -Path (Split-Path -Parent $outputPath) -Force | Out-Null
# Explicit allow-list: never include a live database, environment file, or credentials.
$files = @('package.json', 'package-lock.json', 'src') | ForEach-Object { Join-Path $appPath $_ }
Compress-Archive -LiteralPath $files -DestinationPath $outputPath -Force
Write-Output $outputPath
