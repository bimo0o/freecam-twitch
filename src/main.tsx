import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { Camera } from './Camera';
import { Video } from './Video';
import { configSchema, defaults, type ChannelConfig } from '../shared/model';
import './style.css';
const params = new URLSearchParams(location.search);
const base = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const native = location.pathname.endsWith('overlay.html');
const admin = location.pathname.endsWith('config.html') || params.get('view') === 'config';
if (native) document.body.classList.add('native');
function App() {
  const [channel, setChannel] = useState(params.get('channel') || ''), [token, setToken] = useState('');
  const [config, setConfig] = useState<ChannelConfig>(), [error, setError] = useState(''), [latency, setLatency] = useState<number>();
  const [documentVisible, setDocumentVisible] = useState(!document.hidden), [extensionVisible, setExtensionVisible] = useState(true), [localKey, setLocalKey] = useState('');
  const visible = documentVisible && extensionVisible;
  useEffect(() => {
    window.Twitch?.ext.onAuthorized(auth => { setToken(auth.token); setChannel(auth.channelId); });
    window.Twitch?.ext.onContext(ctx => { if (typeof ctx.hlsLatencyBroadcaster === 'number' && Number.isFinite(ctx.hlsLatencyBroadcaster) && ctx.hlsLatencyBroadcaster > 0) setLatency(ctx.hlsLatencyBroadcaster); });
    window.Twitch?.ext.onVisibilityChanged(setExtensionVisible);
    const visibility = () => setDocumentVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    if (!/^\d{1,20}$/.test(channel)) return;
    const controller = new AbortController();
    const load = async () => { try { const r = await fetch(`${base}/api/channels/${channel}`, { signal: controller.signal }); if (!r.ok) throw new Error('Сервер настроек недоступен'); const c = configSchema.parse(await r.json()); setConfig(c); setError(''); } catch (e) { if (!controller.signal.aborted) setError(String(e)); } };
    void load(); const timer = setInterval(load, 15000); return () => { controller.abort(); clearInterval(timer); };
  }, [channel]);
  if (admin) return <Settings key={channel} channel={channel} token={token} localKey={localKey} setLocalKey={setLocalKey} initial={config} error={error} />;
  if (native) return config ? <Camera key={channel} config={config} channel={channel} base={base} latency={latency} visible={visible} /> : error ? <div className="overlay-error">Камера недоступна</div> : null;
  return <main className="shell"><header><a className="brand" href="/">◈ <b>freecam</b></a><span className="pill">ВАШ ЭФИР. ВАШ РАКУРС.</span><a href={`/?view=config&channel=${channel}`}>Настройки стримера ↗</a></header>
    <div className="intro"><span className="eyebrow">НЕЗАВИСИМАЯ КАМЕРА</span><h1>Расположитесь удобнее.</h1><p>Перемещайте камеру туда, где она не мешает игре. Только на вашем экране.</p></div>
    {!channel && <form className="join" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); location.search = `?channel=${encodeURIComponent(String(data.get('channel')))}`; }}><label>Числовой Twitch Channel ID<input name="channel" required pattern="[0-9]{1,20}" placeholder="ID вашего канала" /></label><button>Открыть трансляцию →</button></form>}
    {error && <p role="alert">{error}</p>}
    {channel && <section className="stage" id="stage">{config && config.login !== defaults.login ? <iframe title="Основная трансляция Twitch" src={`https://player.twitch.tv/?channel=${encodeURIComponent(config.login)}&parent=${encodeURIComponent(location.hostname)}&muted=false`} allow="autoplay; fullscreen" allowFullScreen /> : <div className="empty"><span>◈</span><h2>Подключите трансляцию</h2><p>Укажите Twitch-канал и включите камеру в настройках стримера.</p></div>}{config && <Camera key={channel} config={config} channel={channel} base={base} latency={latency} visible={visible} />}</section>}
    {channel && <div className="stage-footer"><span><i /> {config?.enabled ? 'Камера включена стримером' : 'Камера выключена'}</span><button onClick={() => document.getElementById('stage')?.requestFullscreen()}>На весь экран ⤢</button></div>}
    <div className="tips"><article><span>01</span><h3>Выберите место</h3><p>Потяните за панель камеры и освободите важную часть экрана.</p></article><article><span>02</span><h3>Настройте размер</h3><p>Используйте нижний правый угол. Пропорции сохранятся.</p></article><article><span>03</span><h3>Оставайтесь в моменте</h3><p>При необходимости подстройте задержку через ⚙. Звук идёт из Twitch.</p></article></div><footer>FREECAM <span>Настройки сохраняются в этом браузере для каждого канала.</span></footer></main>;
}
function Settings({ channel, token, localKey, setLocalKey, initial, error }: { channel: string; token: string; localKey: string; setLocalKey: (v: string) => void; initial?: ChannelConfig; error: string }) {
  const [draft, setDraft] = useState<ChannelConfig>(), [message, setMessage] = useState(''), [ingest, setIngest] = useState<{ path: string; user: string; password: string; token: string }>();
  useEffect(() => { if (initial) setDraft(v => v || initial); }, [initial]);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Local-Admin': localKey };
  const update = <K extends keyof ChannelConfig>(key: K, value: ChannelConfig[K]) => setDraft(v => v && ({ ...v, [key]: value }));
  const save = async () => { try { const r = await fetch(`${base}/api/admin/${channel}`, { method: 'PUT', headers, body: JSON.stringify(draft) }); if (!r.ok) throw new Error(`Сохранение отклонено (${r.status})`); setMessage('Настройки сохранены. Зрители получат их в течение 15 секунд.'); } catch (e) { setMessage(String(e)); } };
  const credentials = async () => { try { const r = await fetch(`${base}/api/admin/${channel}/ingest`, { headers }); if (!r.ok) throw new Error('Доступ к подключению отклонён'); setIngest(await r.json()); } catch (e) { setMessage(String(e)); } };
  return <main className="settings-shell"><header><a className="brand" href={`/?channel=${channel}`}>◈ <b>freecam</b></a><span>ПУЛЬТ СТРИМЕРА</span></header><h1>Камера, отдельно.</h1><p>Настройте поток один раз. Зрители сами выберут его положение.</p>{!token && <label>Локальный ключ администратора<input type="password" autoComplete="off" value={localKey} onChange={e => { setLocalKey(e.target.value); setIngest(undefined); }} /><small>Из .env · доступен только в режиме разработки. В Twitch авторизация автоматическая.</small></label>}{error && <p role="alert">{error}</p>}{!channel && <p>Откройте /?view=config&channel=ЧИСЛОВОЙ_ID или страницу конфигурации в Twitch.</p>}
    {draft && <><section className="settings-card"><h2>01 / Трансляция</h2><label className="check"><input type="checkbox" checked={draft.enabled} onChange={e => update('enabled', e.target.checked)} />Камера доступна зрителям</label><label>Имя канала Twitch<input value={draft.login} onChange={e => update('login', e.target.value)} /></label><div className="fields"><label>Разрешение<select value={draft.quality} onChange={e => update('quality', e.target.value as ChannelConfig['quality'])}>{['480p', '720p', '1080p'].map(v => <option key={v}>{v}</option>)}</select></label><label>FPS<select value={draft.fps} onChange={e => update('fps', +e.target.value as ChannelConfig['fps'])}>{[24, 30, 60].map(v => <option key={v}>{v}</option>)}</select></label><label>Битрейт, кбит/с<input type="number" min="200" max="6000" value={draft.bitrate} onChange={e => update('bitrate', +e.target.value)} /></label></div><small>Эти параметры — профиль источника. Примените их в OBS или команде FFmpeg; сервер не перекодирует видео.</small></section>
    <section className="settings-card"><h2>02 / Начальное положение</h2><div className="fields">{(['x', 'y', 'width'] as const).map(k => <label key={k}>{ { x: 'По горизонтали', y: 'По вертикали', width: 'Ширина' }[k]} · {Math.round(draft.placement[k] * 100)}%<input type="range" min={k === 'width' ? .12 : 0} max={k === 'width' ? .65 : 1} step=".01" value={draft.placement[k]} onChange={e => update('placement', { ...draft.placement, [k]: +e.target.value })} /></label>)}</div><label>Пропорции<select value={draft.aspect} onChange={e => update('aspect', e.target.value as ChannelConfig['aspect'])}><option>16:9</option><option>4:3</option></select></label><small>Индивидуальные настройки зрителя имеют приоритет.</small></section>
    <section className="settings-card"><h2>03 / Синхронизация</h2><label className="check"><input type="checkbox" checked={draft.autoSync} onChange={e => update('autoSync', e.target.checked)} />Использовать оценку задержки Twitch</label><label>Резервная задержка камеры, секунд<input type="number" min="2" max="90" step=".1" value={draft.delay} onChange={e => update('delay', +e.target.value)} /></label><p>Точное совпадение не гарантируется. Камера всегда без звука; речь передаётся в основной трансляции.</p></section><button className="primary" onClick={save}>Сохранить настройки →</button><p role="status">{message}</p><section className="settings-card"><h2>04 / Подключение OBS</h2>{initial?.enabled && <div className="settings-preview"><Video url={`${base}/media/${channel}/index.m3u8`} delay={draft.delay} /></div>}<p>Основной эфир — в Twitch без встроенной камеры. Камеру отправляйте отдельным источником в MediaMTX.</p><button onClick={credentials}>Показать реквизиты публикации</button>{ingest && <div className="credentials"><p>Путь: <code>{ingest.path}</code></p><p>RTMP user: <code>{ingest.user}</code></p><p>Пароль: <code>{ingest.password}</code></p><p>WHIP Bearer token: <code>{ingest.token}</code></p><small>Это секреты публикации. Не добавляйте их в браузерные источники и скриншоты.</small></div>}</section></>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
