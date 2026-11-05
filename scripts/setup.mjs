import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
let env;
try { env = await readFile('.env', 'utf8'); }
catch { env = await readFile('.env.example', 'utf8'); }
for (const key of ['LOCAL_ADMIN_SECRET', 'PUBLISH_MASTER_SECRET', 'MEDIA_AUTH_SECRET']) {
  env = env.replace(new RegExp(`^${key}=.*$`, 'm'), line => line === `${key}=` ? `${key}=${randomBytes(32).toString('hex')}` : line);
}
await writeFile('.env', env, { mode: 0o600 });
const callback = env.match(/^MEDIA_AUTH_SECRET=(.+)$/m)?.[1].trim();
if (!callback) throw new Error('MEDIA_AUTH_SECRET missing');
await mkdir('infra', { recursive: true });
await writeFile('infra/mediamtx.local.yml', `logLevel: info
authMethod: http
authHTTPAddress: http://host.docker.internal:3000/internal/media-auth?key=${callback}
authHTTPExclude: []
rtsp: false
rtmp: true
srt: false
api: false
metrics: false
playback: false
moq: false
hls: true
hlsAlwaysRemux: true
hlsVariant: fmp4
hlsSegmentCount: 120
hlsSegmentDuration: 1s
hlsAllowOrigins: []
webrtc: true
webrtcLocalUDPAddress: :8189
paths:
  '~^cam/[0-9]{1,20}$':
    source: publisher
`, { mode: 0o600 });
console.log('Local configuration ready. Admin key is in .env; secrets were not printed.');
