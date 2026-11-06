$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$out=Join-Path $root 'artifacts/store'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$manifest=Get-Content (Join-Path $root 'browser-extension/manifest.json') -Raw | ConvertFrom-Json
if ($manifest.manifest_version -ne 3 -or $manifest.host_permissions -contains '<all_urls>') { throw 'Manifest not suitable for this package' }
foreach ($store in @('chrome','edge')) {
  Compress-Archive -Path (Join-Path $root 'browser-extension/*') -DestinationPath (Join-Path $out "freecam-$store.zip") -Force
}
Get-FileHash (Join-Path $out '*.zip') | Select-Object Hash,Path
