import '../browser-extension/core.js';
import '../browser-extension/runtime.js';
const video = document.getElementById('source'), metrics = document.getElementById('metrics');
let objectUrl;
const controls=document.querySelector('.controls');
const playButton=document.createElement('button');playButton.textContent='Пауза / воспроизведение';playButton.onclick=()=>video.paused?video.play().catch(()=>{}):video.pause();controls.append(playButton);
const audioButton=document.createElement('button');audioButton.textContent='Включить / выключить звук';audioButton.onclick=()=>{video.muted=!video.muted;};controls.append(audioButton);
document.getElementById('enable').onclick = () => { const result = globalThis.FreecamPackedController.start(); metrics.textContent = result.message || 'Обработка включена'; video.play().catch(() => {}); };
document.getElementById('original').onclick = () => globalThis.FreecamPackedController.stop();
document.getElementById('fullscreen').onclick = () => document.getElementById('stage').requestFullscreen();
document.getElementById('file').onchange = e => {
  globalThis.FreecamPackedController.stop(); if (objectUrl) URL.revokeObjectURL(objectUrl);
  const file = e.target.files[0]; if (!file) return;
  objectUrl = URL.createObjectURL(file); video.src = objectUrl; video.play().catch(() => {});
};
const query=new URLSearchParams(location.search);
if (query.has('demo')) { video.src = query.has('presentation') ? '/.tools/packed-presentation.mp4' : query.has('sync') ? '/.tools/packed-sync.mp4' : '/.tools/packed-demo.mp4'; video.play().catch(() => {}); }
if(query.has('compose'))video.addEventListener('loadeddata',()=>globalThis.FreecamPackedController.start(),{once:true});
setInterval(() => { const report = globalThis.FreecamPackedController.report(); metrics.textContent = report.active ? `Один video-элемент · кадров: ${report.frames} · игра ${report.quality.gameWidth}×${report.quality.gameHeight} · исходник камеры ${report.quality.cameraWidth}×${report.quality.cameraHeight}${report.displayWidth>report.quality.cameraWidth?' · камера увеличена: детализация не растёт':''} · звук ${video.muted ? 'выключен' : 'включён'}` : report.message || 'Ожидание маркера'; }, 500);
addEventListener('pagehide', () => { globalThis.FreecamPackedController.stop(); if (objectUrl) URL.revokeObjectURL(objectUrl); });
