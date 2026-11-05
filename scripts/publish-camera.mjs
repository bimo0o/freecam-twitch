import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
const channel = process.env.CAM_CHANNEL_ID || process.env.LOCAL_CHANNEL_ID;
const master = process.env.PUBLISH_MASTER_SECRET;
const password = process.env.CAM_PUBLISH_PASSWORD || (master && createHmac('sha256', master).update(`publish:${channel}`).digest('hex'));
if (!/^\d{1,20}$/.test(channel || '') || !password) throw new Error('Set CAM_CHANNEL_ID and CAM_PUBLISH_PASSWORD (or local .env secrets).');
const profile = process.env.CAM_RESOLUTION || '1280x720';
if (!/^\d{3,4}x\d{3,4}$/.test(profile)) throw new Error('Invalid CAM_RESOLUTION');
const fps = Number(process.env.CAM_FPS || 30), bitrate = Number(process.env.CAM_BITRATE || 1200);
if (![24,30,60].includes(fps) || !Number.isInteger(bitrate) || bitrate < 200 || bitrate > 6000) throw new Error('Invalid FPS/bitrate');
const host = process.env.CAM_RTMP_SERVER || 'rtmp://127.0.0.1:1935';
const server = new URL(host);
if (!['rtmp:','rtmps:'].includes(server.protocol)) throw new Error('Expected RTMP(S) server');
// On a remote untrusted network require RTMPS or an SSH/VPN tunnel.
const url = `${host.replace(/\/$/,'')}/cam/${channel}?user=${encodeURIComponent(channel)}&pass=${encodeURIComponent(password)}`;
const synthetic = process.argv.includes('--testsrc');
const imageIndex = process.argv.indexOf('--image');
const image = imageIndex >= 0 ? process.argv[imageIndex + 1] : undefined;
if (imageIndex >= 0 && (!image || !existsSync(image))) throw new Error('--image requires an existing image file.');
if (image && synthetic) throw new Error('Choose --image or --testsrc.');
const input = image ? ['-loop','1','-re','-framerate',String(fps),'-i',image] : synthetic ? ['-re','-f','lavfi','-i',`testsrc2=size=${profile}:rate=${fps}`] : ['-f','dshow','-framerate',String(fps),'-i',`video=${process.env.CAM_DEVICE || 'OBS Virtual Camera'}`];
let child, stopped = false, retry, attempts = 0;
function start() {
  console.log(image ? 'Temporary image is being encoded into a live video stream (not a webcam).' : synthetic ? 'Diagnostic synthetic video publishing (not a webcam).' : 'Publishing camera; audio stays in Twitch.');
  child = spawn(process.env.FFMPEG_BIN || 'ffmpeg', ['-hide_banner','-loglevel','warning',...input,'-an','-vf',`scale=${profile.replace('x',':')},format=yuv420p`,'-c:v','libx264','-preset','veryfast','-tune','zerolatency','-profile:v','baseline','-bf','0','-r',String(fps),'-g',String(fps),'-b:v',`${bitrate}k`,'-maxrate',`${bitrate}k`,'-bufsize',`${bitrate*2}k`,'-f','flv',url], { stdio:['ignore','ignore','pipe'] });
  child.stderr.on('data', bytes => process.stderr.write(String(bytes).replaceAll(password,'[REDACTED]')));
  child.on('error', e => console.error('FFmpeg could not start:',e.code));
  child.on('close', () => { if (!stopped) retry = setTimeout(start,Math.min(15000,1000*2**Math.min(attempts++,4))); });
}
for (const event of ['SIGINT','SIGTERM']) process.on(event,()=>{ stopped=true; clearTimeout(retry); child?.kill(); });
start();
