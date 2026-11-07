param([string]$ObsRoot='D:/obs-studio',[string]$SdkRoot='.tools/obs-sdk',[string]$Compiler='D:/mingw64/bin/g++.exe')
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
  $version=(Get-Item (Join-Path $ObsRoot 'bin/64bit/obs.dll')).VersionInfo.ProductVersion
  if ($version -ne '33.0.1') { throw "This experimental build is pinned to OBS 33.0.1; found $version" }
  if (-not (Test-Path (Join-Path $SdkRoot 'libobs/obs.h'))) { throw 'Clone official OBS SDK tag 33.0.1 into .tools/obs-sdk first.' }
  $sdkCommit=& git -C $SdkRoot rev-parse HEAD
  if ($LASTEXITCODE -ne 0 -or $sdkCommit -ne '65c320b46e1af5c7a555161aea6182cdf7a8c524') { throw 'OBS SDK must match the official 33.0.1 commit.' }
  $build=Join-Path $root '.tools/obs-build';$out=Join-Path $root 'artifacts/Freecam-OBS-0.5.0'
  New-Item -ItemType Directory -Force -Path $build,$out | Out-Null
  @'
#define OBS_INSTALL_PREFIX ""
#define OBS_DATA_PATH "data"
#define OBS_PLUGIN_DESTINATION "obs-plugins/64bit"
#define OBS_INSTALL_LIBDIR "bin/64bit"
#define OBS_RELEASE_CANDIDATE 0
#define OBS_BETA 0
'@ | Set-Content -LiteralPath (Join-Path $build 'obsconfig.h') -Encoding ascii
  & $Compiler -shared -std=c++17 -D_M_X64 -DWINPTHREAD_STATIC -Wno-deprecated-declarations -pthread -static -I (Join-Path $SdkRoot 'libobs') -I (Join-Path $SdkRoot 'frontend/api') -I $build native/obs-freecam/plugin.cpp -L (Join-Path $ObsRoot 'bin/64bit') '-Wl,-Bdynamic' -l:obs.dll -l:obs-frontend-api.dll '-Wl,-Bstatic' -lws2_32 -lshell32 -o (Join-Path $out 'freecam-obs.dll')
  if ($LASTEXITCODE -ne 0) { throw 'Native build failed' }
  Copy-Item -Path native/obs-freecam/* -Destination $out -Recurse -Force
  $source=Join-Path $out 'source/native/obs-freecam'
  $sourceScripts=Join-Path $out 'source/scripts'
  New-Item -ItemType Directory -Force -Path $source,$sourceScripts | Out-Null
  Copy-Item -Path native/obs-freecam/* -Destination $source -Recurse -Force
  Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $sourceScripts 'build-obs-plugin.ps1') -Force
  Copy-Item -LiteralPath LICENSE -Destination (Join-Path $out 'LICENSE-Freecam-Apps.txt') -Force
  Get-FileHash -LiteralPath (Join-Path $out 'freecam-obs.dll')
} finally {Pop-Location}
