$ErrorActionPreference='Stop'
$workspace=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$out=Join-Path $workspace 'artifacts/Freecam-Twitch-Test'
New-Item -ItemType Directory -Force -Path $out,(Join-Path $out 'scripts'),(Join-Path $out 'shared'),(Join-Path $out 'results')|Out-Null
Copy-Item -LiteralPath (Join-Path $workspace 'artifacts/covert-sei/stream.mp4') -Destination (Join-Path $out 'stream.mp4')
Copy-Item -LiteralPath (Join-Path $workspace 'scripts/check-sei-retention.mjs') -Destination (Join-Path $out 'scripts/check-sei-retention.mjs')
foreach($name in @('covert-sei.mjs','covert-primitives.mjs')){Copy-Item -LiteralPath (Join-Path $workspace "shared/$name") -Destination (Join-Path $out "shared/$name")}
$ffmpeg=(Get-Command ffmpeg).Source
$config=@{ffmpeg=$ffmpeg;node=(Join-Path $workspace 'node_modules/node/bin/node.exe');streamlink=(Join-Path $workspace '.tools/sei-streamlink/Scripts/streamlink.exe');sha256=(Get-FileHash (Join-Path $out 'stream.mp4')).Hash.ToLowerInvariant()}
foreach($path in @($config.ffmpeg,$config.node,$config.streamlink)){if(-not(Test-Path -LiteralPath $path)){throw "Tool missing: $path"}}
$config|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $out 'runtime.json') -Encoding UTF8
$compiler='C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'
Copy-Item -LiteralPath (Join-Path $workspace 'desktop/SeiTransportTest.cs') -Destination (Join-Path $out 'SeiTransportTest.cs')
@('/nologo','/target:winexe','/codepage:65001','/optimize+','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll','/out:Freecam-Twitch-Test.exe','SeiTransportTest.cs') | Set-Content -LiteralPath (Join-Path $out 'compile.rsp') -Encoding UTF8
$compile=Start-Process -FilePath $compiler -ArgumentList '@compile.rsp' -WorkingDirectory $out -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $out 'compile.log') -RedirectStandardError (Join-Path $out 'compile-errors.log')
if($compile.ExitCode-ne 0){Get-Content (Join-Path $out 'compile.log');throw 'Compilation failed'}
$check=Start-Process -FilePath (Join-Path $out 'Freecam-Twitch-Test.exe') -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru
if($check.ExitCode-ne 0){throw "Application readiness failed: $($check.ExitCode)"}
Copy-Item -LiteralPath (Join-Path $workspace 'docs/TWITCH-TEST-INSTRUCTIONS.txt') -Destination (Join-Path $out 'ИНСТРУКЦИЯ.txt')
Write-Output "Ready: $out"
