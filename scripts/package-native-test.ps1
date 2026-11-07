param()
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
  $out=Join-Path $root 'artifacts/Freecam-OBS-0.5.0'
  foreach ($name in @('freecam-obs.dll','Freecam Native Setup.exe','Install Freecam OBS.exe','COPYING','README.md','source/native/obs-freecam/plugin.cpp','source/scripts/build-obs-plugin.ps1','setup-report.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $out $name))) { throw "Missing package file: $name" }
  }
  if (-not (Get-Content -Raw (Join-Path $out 'setup-report.json') | ConvertFrom-Json).originalScenePreserved) { throw 'Run the real OBS setup test first.' }
  $reports=Join-Path $out 'validation'
  New-Item -ItemType Directory -Force -Path $reports | Out-Null
  foreach ($file in @('artifacts/Freecam-OBS-Private/audit/report.json','artifacts/Freecam-OBS-Private/native-viewer-report.json','artifacts/Freecam-OBS-Private/native-worker-viewer-report.json','artifacts/covert-sei/extension-report.json','artifacts/covert-sei/extension-edge-report.json')) {
    Copy-Item -LiteralPath $file -Destination $reports -Force
  }
  # Archive an explicit allowlist. Test recordings and private OBS credentials
  # never enter the distributable, even if they appear in the output directory.
  $files=@('freecam-obs.dll','Freecam Native Setup.exe','Install Freecam OBS.exe','COPYING','README.md','THIRD-PARTY.md','licenses','source','LICENSE-Freecam-Apps.txt','validation','setup-report.json') | ForEach-Object { Join-Path $out $_ }
  $nativeZip=Join-Path $root 'artifacts/Freecam-OBS-0.5.0.zip'
  Compress-Archive -LiteralPath $files -DestinationPath $nativeZip -Force
  $extension='artifacts/Freecam-SEI-Extension'
  Copy-Item -LiteralPath LICENSE -Destination (Join-Path $extension 'LICENSE.txt') -Force
  $extensionFiles=@('manifest.json','content.js','tap.js','popup.html','popup.js','icons','ИНСТРУКЦИЯ.txt','LICENSE.txt') | ForEach-Object { Join-Path $extension $_ }
  $viewerZip=Join-Path $root 'artifacts/Freecam-0.5.0-RC.zip'
  Compress-Archive -LiteralPath $extensionFiles -DestinationPath $viewerZip -Force
  Get-FileHash -LiteralPath $nativeZip,$viewerZip | Format-Table Algorithm,Hash,Path -AutoSize
} finally { Pop-Location }
