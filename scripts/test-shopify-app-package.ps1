param([string]$NodePath = 'node', [string]$ArchivePath = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$repoRoot = Split-Path -Parent $PSScriptRoot
$archive = if ($ArchivePath) { (Resolve-Path -LiteralPath $ArchivePath).Path } else { Join-Path $repoRoot 'dist/place-in-thyme-shopify-app.zip' }
$version = (Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'shopify-app/package.json') | ConvertFrom-Json).version
$verify = Join-Path $PSScriptRoot 'verify-shopify-app-package.ps1'
$valid = & $verify -ArchivePath $archive -ExpectedVersion $version -NodePath $NodePath
if (-not $valid.runtimeCheck.isolatedArtifactBoot -or $valid.runtimeCheck.externalRequests -ne 0) { throw 'Valid artifact failed its runtime check.' }
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([char[]]'\/')
$fixtures = Join-Path $temporaryRoot ('pit-package-fixtures-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtures | Out-Null
function Assert-Rejected([string]$Name, [scriptblock]$Mutate, [string]$ExpectedMessage, [string]$Version = $version) {
  $file = Join-Path $fixtures ($Name + '.zip')
  Copy-Item -LiteralPath $archive -Destination $file
  $zip = [IO.Compression.ZipFile]::Open($file, [IO.Compression.ZipArchiveMode]::Update)
  try { & $Mutate $zip } finally { $zip.Dispose() }
  $rejected = $false
  try { & $verify -ArchivePath $file -ExpectedVersion $Version -NodePath $NodePath | Out-Null }
  catch {
    if ($_.Exception.Message -notmatch $ExpectedMessage) { throw }
    $rejected = $true
  }
  if (-not $rejected) { throw "Unsafe package accepted: $Name" }
  Write-Output "PASS: rejects $Name"
}
function Add-TestEntry($Zip, [string]$Name) {
  $entry = $Zip.CreateEntry($Name)
  $writer = [IO.StreamWriter]::new($entry.Open())
  try { $writer.Write('TEST-ONLY-fixture') } finally { $writer.Dispose() }
}
try {
  Write-Output 'PASS: current archive matches source and boots without external requests'
  Assert-Rejected 'private-environment-file' { param($z) Add-TestEntry $z '.env' } 'Archive contains'
  Assert-Rejected 'missing-runtime-file' { param($z) $z.GetEntry('src/server.mjs').Delete() } 'Archive contains'
  Assert-Rejected 'duplicate-entry' { param($z) Add-TestEntry $z 'package.json' } 'Archive contains'
  Assert-Rejected 'path-traversal' { param($z) Add-TestEntry $z '../outside-test.txt' } 'Archive contains'
  Assert-Rejected 'unexpected-directory' { param($z) $z.CreateEntry('../') | Out-Null } 'Unexpected archive directory'
  Assert-Rejected 'wrong-filename-case' { param($z) $z.GetEntry('src/server.mjs').Delete(); Add-TestEntry $z 'src/SERVER.mjs' } 'Archive contains'
  Assert-Rejected 'altered-runtime' { param($z) $z.GetEntry('src/worker.mjs').Delete(); Add-TestEntry $z 'src/worker.mjs' } 'stale or altered'
  Assert-Rejected 'wrong-version' { param($z) } 'Package version disagrees' '0.0.0'
  Write-Output '9 package acceptance checks passed. No live configuration or database was used.'
} finally {
  $checkedFixtures = (Resolve-Path -LiteralPath $fixtures).Path
  if ((Split-Path -Parent $checkedFixtures) -ne $temporaryRoot -or (Split-Path -Leaf $checkedFixtures) -notmatch '^pit-package-fixtures-[a-f0-9]{32}$') { throw 'Refusing unsafe fixture cleanup.' }
  Remove-Item -LiteralPath $checkedFixtures -Recurse -Force
}
