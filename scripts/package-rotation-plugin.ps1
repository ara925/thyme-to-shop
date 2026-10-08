$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$pluginPath = Join-Path $repoRoot 'wordpress\place-in-thyme-meal-rotation'
$outputPath = Join-Path $repoRoot 'dist\place-in-thyme-meal-rotation.zip'
New-Item -ItemType Directory -Path (Split-Path -Parent $outputPath) -Force | Out-Null
Compress-Archive -LiteralPath $pluginPath -DestinationPath $outputPath -Force
Write-Output $outputPath
