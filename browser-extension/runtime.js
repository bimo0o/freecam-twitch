(() => {
  if (globalThis.FreecamPackedController) return;
  let current;
  const core = globalThis.FreecamPackedCore;
  const styles = `
    :host{position:absolute;inset:0;z-index:1;pointer-events:none;display:block;font:13px system-ui;color:#fff}
    *{box-sizing:border-box}.picture{position:absolute;overflow:hidden;pointer-events:none;background:#000}.game{width:100%;height:100%;display:block}
    .camera{position:absolute;border:1px solid #ffffff65;border-radius:7px;overflow:hidden;pointer-events:auto;box-shadow:0 4px 18px #0007}.cam{width:100%;height:100%;display:block}
    .tools{position:absolute;top:4px;left:4px;right:4px;display:flex;gap:3px;opacity:0}.camera:hover .tools,.camera:focus-within .tools,.camera:hover .resize,.camera:focus-within .resize{opacity:1}
    button{font:inherit;color:#fff;background:#201c2feb;border:1px solid #ffffff38;border-radius:5px;padding:5px 8px;cursor:pointer}.drag{flex:1;touch-action:none;cursor:grab;text-align:left}.resize{position:absolute;bottom:0;right:0;touch-action:none;cursor:nwse-resize;opacity:0}
    .restore{position:absolute;left:12px;top:12px;pointer-events:auto}.notice{position:absolute;left:12px;top:12px;max-width:85%;padding:8px;background:#201c2fe8;border-radius:5px;font-size:12px}.notice:empty{display:none}[hidden]{display:none!important}
    @media(hover:none){.tools,.resize{opacity:1}}
  `;
  function start(options = {}) {
    current?.stop();
    const candidates = [...document.querySelectorAll('video')].filter(v => v.isConnected && v.getBoundingClientRect().width > 100 && v.getBoundingClientRect().height > 70);
    const video = candidates.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    if (!video) return { ok: false, message: 'Видимый video-элемент не найден. Откройте сам канал, а не страницу с iframe.' };
    if (video.mediaKeys) return { ok: false, message: 'Защищённое видео не поддерживается.' };
    const parent = video.parentElement;
    if (!parent) return { ok: false, message: 'Область видео не найдена.' };
    const route = location.pathname;
    const key = `freecam-packed:v1:${location.hostname}:${route}`;
    let p = core.placement(), stopped = false, failed = false, active = false, frameId, frameKind, frameCount = 0, savedTimer, drag, lastProbe=-Infinity;
    let bounds = { width: 1, height: 1 }, cameraRect;
    const previousPosition = parent.style.position, previousOpacity = video.style.opacity;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    const host = document.createElement('div'); host.dataset.freecamPacked = 'true';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = styles; shadow.append(style);
    const picture = document.createElement('div'); picture.className = 'picture'; picture.hidden = true;
    const game = document.createElement('canvas'); game.className = 'game'; game.setAttribute('aria-label', 'Область игры из общего потока');
    const camera = document.createElement('div'); camera.className = 'camera';
    const cam = document.createElement('canvas'); cam.className = 'cam'; cam.setAttribute('aria-label', 'Камера из того же кадра');
    const controls = document.createElement('div'); controls.className = 'tools';
    function button(label, text, parentNode, action) { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', label); b.textContent = text; if (action) b.addEventListener('click', action); parentNode.append(b); return b; }
    const moveHandle = button('Переместить камеру', '⠿ Камера', controls); moveHandle.className = 'drag';
    button('Сбросить камеру', '↺', controls, () => { p = core.placement(); place(); save(); });
    button('Скрыть камеру', '×', controls, () => { p.hidden = true; place(); save(); });
    const resizeHandle = button('Изменить размер камеры', '◢', camera); resizeHandle.className = 'resize';
    const restore = button('Показать камеру', 'Показать камеру', picture, () => { p.hidden = false; place(); save(); }); restore.className = 'restore';
    const notice = document.createElement('div'); notice.className = 'notice'; notice.setAttribute('role', 'status');
    camera.prepend(cam); camera.append(controls); picture.prepend(game); picture.append(camera); shadow.append(picture, notice); parent.append(host);
    const gc = game.getContext('2d', { alpha: false }), cc = cam.getContext('2d', { alpha: false });
    const probe = document.createElement('canvas'); probe.width = probe.height = 8;
    const pc = probe.getContext('2d', { willReadFrequently: true });
    // Freeze the video frame ONCE: a decoder may advance while multiple drawImage(video) calls run.
    const snapshot=document.createElement('canvas'),sc=snapshot.getContext('2d',{alpha:false});
    function place() { cameraRect = core.rect(p, bounds.width, bounds.height); Object.assign(camera.style, { left: `${cameraRect.left}px`, top: `${cameraRect.top}px`, width: `${cameraRect.width}px`, height: `${cameraRect.height}px` }); camera.hidden = p.hidden; restore.hidden = !p.hidden; }
    function size() {
      const v = video.getBoundingClientRect(), container = parent.getBoundingClientRect();
      const width = Math.min(v.width, v.height * 16 / 9), height = width * 9 / 16;
      bounds = { width, height };
      Object.assign(picture.style, { left: `${v.left - container.left + (v.width - width) / 2}px`, top: `${v.top - container.top + (v.height - height) / 2}px`, width: `${width}px`, height: `${height}px` });
      // Cap backing surfaces to source dimensions, avoiding a 4K canvas on a 1080p source.
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const gw = Math.max(2, Math.min(1920, Math.round(width * dpr)));
      if (game.width !== gw) { game.width = gw; game.height = Math.round(gw * 9 / 16); }
      cam.width = 320; cam.height = 180;
      place();
    }
    function save() { clearTimeout(savedTimer); savedTimer = setTimeout(() => {
      if (globalThis.chrome?.storage?.local) chrome.storage.local.set({ [key]: p }).catch(() => { notice.textContent = 'Не удалось сохранить положение.'; });
      else { try { localStorage.setItem(key, JSON.stringify(p)); } catch { notice.textContent = 'Браузер запретил сохранение положения.'; } }
    }, 150); }
    const load = globalThis.chrome?.storage?.local ? chrome.storage.local.get(key).then(v => v[key]) : Promise.resolve().then(() => JSON.parse(localStorage.getItem(key) || 'null'));
    load.then(v => { if (!stopped && !drag) { p = core.placement(v); place(); } }).catch(() => {});
    function pointerDown(e, resize) { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag = { id: e.pointerId, x: e.clientX, y: e.clientY, p: { ...p }, r: core.rect(p, bounds.width, bounds.height), resize }; }
    function pointerMove(e) {
      if (!drag || drag.id !== e.pointerId) return;
      const d = drag, dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (d.resize) { p.width = core.clamp((d.r.width + dx) / bounds.width, .12, .65); const next = core.rect(p, bounds.width, bounds.height); p.x = core.clamp(d.r.left / Math.max(1, bounds.width - next.width), 0, 1); p.y = core.clamp(d.r.top / Math.max(1, bounds.height - next.height), 0, 1); }
      else { p.x = core.clamp((d.r.left + dx) / Math.max(1, bounds.width - d.r.width), 0, 1); p.y = core.clamp((d.r.top + dy) / Math.max(1, bounds.height - d.r.height), 0, 1); }
      place(); save();
    }
    for (const [handle, resize] of [[moveHandle, false], [resizeHandle, true]]) {
      handle.addEventListener('pointerdown', e => pointerDown(e, resize)); handle.addEventListener('pointermove', pointerMove);
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(event, () => { drag = null; });
    }
    function original(message = '') { active = false; picture.hidden = true; video.style.opacity = previousOpacity; notice.textContent = options.silent ? '' : message; host.dataset.state = failed ? 'unsupported' : 'waiting'; }
    function adVisible() { return [...document.querySelectorAll('[data-a-target="video-ad-label"], [data-a-target="video-ad-countdown"], [data-test-selector="ad-banner-default-text"]')].some(el => el.getClientRects().length > 0); }
    function schedule() { if (stopped || failed || document.hidden) return; if (video.requestVideoFrameCallback) { frameKind = 'video'; frameId = video.requestVideoFrameCallback(draw); } else { frameKind = 'timer'; frameId = setTimeout(draw, 33); } }
    function cancel() { if (frameKind === 'video') video.cancelVideoFrameCallback?.(frameId); else clearTimeout(frameId); }
    function draw(_now, metadata) {
      if (stopped || failed) return;
      if (!video.isConnected || location.pathname !== route) { stop(); return; }
      if(!active&&performance.now()-lastProbe<750){schedule();return;}lastProbe=performance.now();
      try {
        if (document.hidden || video.readyState < 2 || adVisible()) original();
        else if (video.mediaKeys) { failed = true; original('Защищённое видео: оставлен оригинальный плеер.'); }
        else if (Math.abs(video.videoWidth / video.videoHeight - 16 / 9) > .03) original('Ожидается компоновка Freecam 16:9.');
        else {
          if(snapshot.width!==video.videoWidth||snapshot.height!==video.videoHeight){snapshot.width=video.videoWidth;snapshot.height=video.videoHeight;}
          sc.drawImage(video,0,0,snapshot.width,snapshot.height);
          const edge=globalThis.FreecamEdgeCore?.detect(snapshot);
          pc.drawImage(snapshot, ...core.crop(core.layout.marker, snapshot.width, snapshot.height), 0, 0, 8, 8);
          if (!edge && !core.markerMatches(pc.getImageData(0, 0, 8, 8).data)) original('Нет маркера Freecam — показан исходный кадр.');
          else {
            // Both surfaces are drawn synchronously from ONE video and ONE decoded frame.
            if(edge){
              if(cam.width!==640){cam.width=640;cam.height=360;}
              globalThis.FreecamEdgeCore.decode(snapshot,edge,game,p.hidden?null:cam);
              host.dataset.transport='edge-'+edge;
            }else{
              gc.drawImage(snapshot, ...core.crop(core.layout.game, snapshot.width, snapshot.height), 0, 0, game.width, game.height);
              if (!p.hidden) cc.drawImage(snapshot, ...core.crop(core.layout.camera, snapshot.width, snapshot.height), 0, 0, cam.width, cam.height);
              host.dataset.transport='packed';
            }
            active = true; picture.hidden = false; video.style.opacity = '0'; notice.textContent = '';
            host.dataset.state = 'active'; host.dataset.frames = String(++frameCount); host.dataset.mediaTime = String(metadata?.mediaTime ?? video.currentTime);
          }
        }
      } catch (err) { failed = true; original(err?.name === 'SecurityError' ? 'Браузер запретил доступ к кадрам. Исходный плеер сохранён.' : 'Обработка кадра недоступна. Исходный плеер сохранён.'); }
      schedule();
    }
    function visibility() { cancel(); if (document.hidden) original(); else schedule(); }
    // Paused seeks need an explicit redraw: a decoder callback can arrive while
    // readyState is low, with no subsequent playing frame to resume detection.
    function seeking() { cancel(); }
    function seeked() { cancel(); lastProbe=-Infinity; draw(performance.now()); }
    const resizeObserver = new ResizeObserver(size); resizeObserver.observe(parent); resizeObserver.observe(video);
    const routeTimer = setInterval(() => { if (!video.isConnected || location.pathname !== route) stop(); else if (adVisible()) original(); }, 1000);
    document.addEventListener('visibilitychange', visibility);
    video.addEventListener('seeking', seeking); video.addEventListener('seeked', seeked);
    function stop() { if (stopped) return; stopped = true; cancel(); clearTimeout(savedTimer); clearInterval(routeTimer); resizeObserver.disconnect(); document.removeEventListener('visibilitychange', visibility); video.removeEventListener('seeking', seeking); video.removeEventListener('seeked', seeked); video.style.opacity = previousOpacity; parent.style.position = previousPosition; host.remove(); }
    current = { stop, report: () => ({ ok: true, active, frames: frameCount, failed, message: notice.textContent, placement: { ...p }, quality:core.quality(video.videoWidth,video.videoHeight),displayWidth:Math.round(cameraRect?.width||0) }) };
    size(); original('Ожидание кадра с маркером Freecam…'); schedule();
    return current.report();
  }
  globalThis.FreecamPackedController = { start, stop: () => { current?.stop(); current = undefined; }, report: () => current?.report() || { ok: true, active: false, message: 'Выключено' } };
})();
