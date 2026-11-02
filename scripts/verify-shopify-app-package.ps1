param(
  [Parameter(Mandatory = $true)][string]$ArchivePath,
  [Parameter(Mandatory = $true)][string]$ExpectedVersion,
  [string]$NodePath = 'node',
  [string]$SourceRef = ''
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$archiveFullPath = (Resolve-Path -LiteralPath $ArchivePath).Path
Add-Type -AssemblyName System.IO.Compression.FileSystem
if ($SourceRef) {
  $resolvedRef = (& git -C $repoRoot rev-parse --verify --end-of-options "${SourceRef}^{commit}").Trim()
  if ($LASTEXITCODE -ne 0 -or $resolvedRef -notmatch '^[a-f0-9]{40}$') { throw 'Unknown rollback source revision.' }
  $sourcePaths = @(& git -C $repoRoot ls-tree -r --name-only $resolvedRef -- shopify-app/src)
} else {
  $sourcePaths = @(& git -C $repoRoot ls-files -- shopify-app/src)
}
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the tracked app source.' }
$expected = @('package.json', 'package-lock.json') + @($sourcePaths | ForEach-Object {
  if ($_ -notmatch '^shopify-app/src/[a-z0-9-]+\.mjs$') { throw 'Unexpected tracked runtime file; review the allow-list.' }
  $_.Substring('shopify-app/'.Length)
})
$expected = @($expected | Sort-Object)
if ($expected.Count -lt 3) { throw 'Runtime source is missing.' }
$zip = [IO.Compression.ZipFile]::OpenRead($archiveFullPath)
$sha = [Security.Cryptography.SHA256]::Create()
$sha1 = [Security.Cryptography.SHA1]::Create()
$files = @()
try {
  foreach ($directoryEntry in @($zip.Entries | Where-Object { $_.FullName.EndsWith('/') })) {
    if ($directoryEntry.FullName -ne 'src/' -or $directoryEntry.Length -ne 0) { throw 'Unexpected archive directory.' }
  }
  $fileEntries = @($zip.Entries | Where-Object { -not $_.FullName.EndsWith('/') })
  $names = @($fileEntries | ForEach-Object { $_.FullName } | Sort-Object)
  if ($names.Count -ne $expected.Count -or (Compare-Object -CaseSensitive $expected $names)) { throw 'Archive contains missing, unexpected or duplicate files.' }
  foreach ($entry in $fileEntries) {
    if ($entry.Length -gt 1048576) { throw 'Unexpectedly large app file.' }
    $stream = $entry.Open(); $memory = [IO.MemoryStream]::new()
    try { $stream.CopyTo($memory); $bytes = $memory.ToArray() } finally { $stream.Dispose(); $memory.Dispose() }
    $hash = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','')
    if ($SourceRef) {
      $blobHeader = [Text.Encoding]::UTF8.GetBytes("blob $($bytes.Length)`0")
      $blobHash = ([BitConverter]::ToString($sha1.ComputeHash([byte[]]($blobHeader + $bytes)))).Replace('-','').ToLowerInvariant()
      $expectedBlob = (& git -C $repoRoot rev-parse "${resolvedRef}:shopify-app/$($entry.FullName)").Trim()
      if ($LASTEXITCODE -ne 0 -or $blobHash -ne $expectedBlob) { throw "Archive differs from rollback source: $($entry.FullName)" }
    } else {
      $sourceFile = Join-Path (Join-Path $repoRoot 'shopify-app') $entry.FullName
      if ((Get-Item -LiteralPath $sourceFile).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked runtime files are not permitted.' }
      if ($hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceFile).Hash) { throw "Archive is stale or altered: $($entry.FullName)" }
    }
    $files += [pscustomobject]@{ path = $entry.FullName; bytes = $entry.Length; sha256 = $hash }
  }
} finally { $zip.Dispose(); $sha.Dispose(); $sha1.Dispose() }
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([char[]]'\/')
$stage = Join-Path $temporaryRoot ('pit-release-check-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  # Entry names were checked against tracked files before extraction; no ZIP paths are trusted.
  [IO.Compression.ZipFile]::ExtractToDirectory($archiveFullPath, $stage)
  $package = Get-Content -Raw -LiteralPath (Join-Path $stage 'package.json') | ConvertFrom-Json
  if ($package.version -ne $ExpectedVersion) { throw 'Package version disagrees with the expected release.' }
  $runtimeJson = & $NodePath (Join-Path $PSScriptRoot 'smoke-shopify-app-release.mjs') $stage $ExpectedVersion
  if ($LASTEXITCODE -ne 0) { throw 'Isolated packaged-runtime check failed.' }
  $runtime = $runtimeJson | ConvertFrom-Json
} finally {
  $checkedStage = (Resolve-Path -LiteralPath $stage).Path
  if ((Split-Path -Parent $checkedStage) -ne $temporaryRoot -or (Split-Path -Leaf $checkedStage) -notmatch '^pit-release-check-[a-f0-9]{32}$') { throw 'Refusing unsafe temporary cleanup.' }
  Remove-Item -LiteralPath $checkedStage -Recurse -Force
}
[pscustomobject]@{
  version = $ExpectedVersion; archive = $archiveFullPath
  sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $archiveFullPath).Hash
  source = $(if ($SourceRef) { $resolvedRef } else { 'current-workspace' })
  fileCount = $files.Count; sourceFilesMatch = $true; privateFilesExcluded = $true
  runtimeCheck = $runtime; files = $files
}
