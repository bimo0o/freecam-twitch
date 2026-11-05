import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { geometry, placementSchema, type ChannelConfig, type Placement } from '../shared/model';
import { Video } from './Video';
type Prefs = Placement & { hidden: boolean; offset: number };
export function Camera({ config, channel, base, latency, visible }: { config: ChannelConfig; channel: string; base: string; latency?: number; visible: boolean }) {
  const key = `freecam:v1:${channel}`;
  const initial = (): Prefs => {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return { ...placementSchema.parse(v), hidden: v.hidden === true, offset: typeof v.offset === 'number' && Number.isFinite(v.offset) ? Math.max(-30, Math.min(60, v.offset)) : 0 }; }
    catch { return { ...config.placement, hidden: false, offset: 0 }; }
  };
  const [prefs, setPrefs] = useState(initial), [size, setSize] = useState({ w: 1, h: 1 }), [storageFailed, setStorageFailed] = useState(false);
  const [settings, setSettings] = useState(false);
  const root = useRef<HTMLDivElement>(null), drag = useRef<{ id: number; x: number; y: number; p: Prefs; resize: boolean } | null>(null);
  const aspect = config.aspect === '16:9' ? 16 / 9 : 4 / 3;
  const g = geometry(prefs, size.w, size.h, aspect);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(root.current!); return () => observer.disconnect();
  }, []);
  useEffect(() => { const t = setTimeout(() => { try { localStorage.setItem(key, JSON.stringify(prefs)); } catch { setStorageFailed(true); } }, 200); return () => clearTimeout(t); }, [prefs, key]);
  const down = (e: PointerEvent<HTMLElement>, resize: boolean) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, p: prefs, resize };
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const old = geometry(d.p, size.w, size.h, aspect), dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (d.resize) {
      const width = Math.max(.12, Math.min(.65, (old.width + dx) / size.w, size.h * aspect / size.w));
      const next = geometry({ ...d.p, width }, size.w, size.h, aspect);
      setPrefs(p => ({ ...p, width, x: Math.max(0, Math.min(1, old.left / Math.max(1, size.w - next.width))), y: Math.max(0, Math.min(1, old.top / Math.max(1, size.h - next.height))) }));
    } else setPrefs(p => ({ ...p, x: Math.max(0, Math.min(1, (old.left + dx) / Math.max(1, size.w - old.width))), y: Math.max(0, Math.min(1, (old.top + dy) / Math.max(1, size.h - old.height))) }));
  };
  const up = () => { drag.current = null; };
  const delay = Math.max(2, Math.min(90, (config.autoSync && latency !== undefined ? latency : config.delay) + prefs.offset));
  return <div ref={root} className="overlay-root">
    {config.enabled && !prefs.hidden && visible && <div className="camera" style={{ left: g.left, top: g.top, width: g.width, height: g.height }}>
      <Video url={`${base}/media/${channel}/index.m3u8`} delay={delay} />
      <div className="camera-controls">
        <button className="drag" aria-label="Переместить камеру" onPointerDown={e => down(e, false)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>⠿ <span>Камера</span></button>
        <button aria-label="Настроить задержку" onClick={() => setSettings(v => !v)}>⚙</button>
        <button aria-label="Сбросить положение" onClick={() => setPrefs({ ...config.placement, hidden: false, offset: 0 })}>↺</button>
        <button aria-label="Скрыть камеру" onClick={() => setPrefs(p => ({ ...p, hidden: true }))}>×</button>
      </div>
      <button className="resize" aria-label="Изменить размер камеры" onPointerDown={e => down(e, true)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>◢</button>
    </div>}
    {config.enabled && visible && <div className="viewer-tools"><button onClick={() => setPrefs(p => ({ ...p, hidden: !p.hidden }))}>{prefs.hidden ? 'Показать камеру' : '◉'}<span className="sr-only">Управление камерой</span></button><button onClick={() => setSettings(v => !v)} aria-label="Параметры камеры">⚙</button></div>}
    {settings && <section className="sync-panel"><strong>Ваша камера</strong><p>Задержка: {delay.toFixed(1)} с · {config.autoSync && latency !== undefined ? 'оценка Twitch' : 'ручная настройка'}</p><label>Поправка: {prefs.offset.toFixed(1)} с<input aria-label="Поправка задержки" type="range" min="-30" max="60" step="0.1" value={prefs.offset} onChange={e => setPrefs(p => ({ ...p, offset: +e.target.value }))} /></label><p>Если камера опережает речь, увеличьте задержку. Точное совпадение с Twitch не гарантируется.</p><button onClick={() => setPrefs({ ...config.placement, hidden: false, offset: 0 })}>Вернуть настройки стримера</button><button onClick={() => setSettings(false)}>Закрыть</button>{storageFailed && <p>Браузер запретил сохранение настроек.</p>}</section>}
  </div>;
}
