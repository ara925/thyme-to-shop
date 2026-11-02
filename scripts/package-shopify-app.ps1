param([string]$NodePath = 'node', [string]$OutputDirectory = '')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$appPath = Join-Path $repoRoot 'shopify-app'
$outputFolder = if (-not $OutputDirectory) { Join-Path $repoRoot 'dist' } elseif ([IO.Path]::IsPathRooted($OutputDirectory)) { [IO.Path]::GetFullPath($OutputDirectory) } else { [IO.Path]::GetFullPath((Join-Path $repoRoot $OutputDirectory)) }
$outputPath = Join-Path $outputFolder 'place-in-thyme-shopify-app.zip'
New-Item -ItemType Directory -Path (Split-Path -Parent $outputPath) -Force | Out-Null
$candidatePath = Join-Path (Split-Path -Parent $outputPath) ('pit-app-candidate-' + [Guid]::NewGuid().ToString('N') + '.zip')
# Explicit allow-list: never include a live database, environment file, or credentials.
$files = @('package.json', 'package-lock.json', 'src') | ForEach-Object { Join-Path $appPath $_ }
try {
  Compress-Archive -LiteralPath $files -DestinationPath $candidatePath
  $expectedVersion = (Get-Content -Raw -LiteralPath (Join-Path $appPath 'package.json') | ConvertFrom-Json).version
  $receipt = & (Join-Path $PSScriptRoot 'verify-shopify-app-package.ps1') -ArchivePath $candidatePath -ExpectedVersion $expectedVersion -NodePath $NodePath
  Move-Item -LiteralPath $candidatePath -Destination $outputPath -Force
  $receipt.archive = $outputPath
} finally {
  if (Test-Path -LiteralPath $candidatePath) {
    if ((Split-Path -Parent $candidatePath) -ne (Split-Path -Parent $outputPath) -or (Split-Path -Leaf $candidatePath) -notmatch '^pit-app-candidate-[a-f0-9]{32}\.zip$') { throw 'Refusing unsafe candidate cleanup.' }
    Remove-Item -LiteralPath $candidatePath -Force
  }
}
$receiptPath = [IO.Path]::ChangeExtension($outputPath, 'receipt.json')
$receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
Write-Output $outputPath
Write-Output $receiptPath
