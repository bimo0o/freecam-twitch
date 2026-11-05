import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const filter = 'color=c=black:s=48x48,drawbox=x=0:y=0:w=24:h=24:color=0x00ff00:t=fill,drawbox=x=24:y=0:w=24:h=24:color=0xff00ff:t=fill,drawbox=x=0:y=24:w=24:h=24:color=0x00ffff:t=fill,drawbox=x=24:y=24:w=24:h=24:color=white:t=fill,format=rgb24';
const job = spawn(process.env.FFMPEG_BIN || 'ffmpeg', ['-hide_banner','-loglevel','error','-y','-f','lavfi','-i',filter,'-frames:v','1','artifacts/obs-marker.png'], { stdio:'inherit' });
job.on('error', () => { console.error('FFmpeg not available'); process.exitCode = 1; });
job.on('close', code => { process.exitCode = code || 0; if (!code) console.log('Marker ready: artifacts/obs-marker.png (48x48)'); });
