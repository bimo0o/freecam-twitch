import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { syncTarget } from '../shared/model';

export function Video({ url, delay }: { url: string; delay: number }) {
  const ref = useRef<HTMLVideoElement>(null), delayRef = useRef(delay);
  delayRef.current = delay;
  const [status, setStatus] = useState('Подключение камеры…');
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const video = ref.current!;
    let hls: Hls | undefined, timer: ReturnType<typeof setTimeout>, stopped = false, attempts = 0;
    const play = () => { video.play().then(() => setBlocked(false)).catch(() => setBlocked(true)); };
    const clean = () => { hls?.destroy(); hls = undefined; video.removeAttribute('src'); video.load(); };
    const retry = () => {
      if (stopped) return;
      clean(); setStatus('Нет сигнала · повторное подключение…');
      clearTimeout(timer); timer = setTimeout(connect, Math.min(15000, 1000 * 2 ** Math.min(attempts++, 4)));
    };
    const connect = () => {
      if (stopped) return;
      if (Hls.isSupported()) {
        hls = new Hls({ lowLatencyMode: false, enableWorker: false, liveSyncDuration: 90, liveMaxLatencyDuration: 120, maxBufferLength: 100, backBufferLength: 100, maxMaxBufferLength: 120 });
        hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) retry(); });
        hls.on(Hls.Events.MANIFEST_PARSED, play);
        hls.loadSource(url); hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = url; play(); }
      else setStatus('Этот браузер не поддерживает HLS');
    };
    const playing = () => { attempts = 0; setStatus(''); };
    const waiting = () => setStatus('Буферизация…');
    video.addEventListener('playing', playing); video.addEventListener('waiting', waiting); video.addEventListener('error', retry);
    connect();
    let lastProgress = Date.now(), previousTime = -1;
    const interval = setInterval(() => {
      if (!video.seekable.length) return;
      const start = video.seekable.start(0), edge = video.seekable.end(video.seekable.length - 1);
      let target = syncTarget(edge, start, delayRef.current);
      // PDT maps the publisher's wall clock to this playlist timeline.
      const playingDate = hls?.playingDate;
      if (playingDate) target = video.currentTime + (Date.now() - delayRef.current * 1000 - playingDate.getTime()) / 1000;
      target = Math.max(start + .1, Math.min(edge - .25, target));
      const error = target - video.currentTime;
      if (Math.abs(error) > 1.5) video.currentTime = target;
      else video.playbackRate = Math.abs(error) > .25 ? (error > 0 ? 1.03 : .97) : 1;
      if (video.currentTime !== previousTime) { previousTime = video.currentTime; lastProgress = Date.now(); }
      if (!video.paused && Date.now() - lastProgress > 20000) { lastProgress = Date.now(); retry(); }
    }, 1000);
    return () => { stopped = true; clearTimeout(timer); clearInterval(interval); video.removeEventListener('playing', playing); video.removeEventListener('waiting', waiting); video.removeEventListener('error', retry); clean(); };
  }, [url]);
  return <><video ref={ref} muted autoPlay playsInline aria-label="Отдельный видеопоток веб-камеры" />{status && <div className="video-status" role="status"><span className="signal" />{status}</div>}{blocked && <button className="play" onClick={() => ref.current?.play().then(() => setBlocked(false))}>Включить видео</button>}</>;
}
