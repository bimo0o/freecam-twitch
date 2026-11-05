import express from 'express';
import rateLimit from 'express-rate-limit';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { configSchema, defaults, type ChannelConfig } from '../shared/model.js';
import { broadcaster, equal, publishKey } from './auth.js';

export interface Options { secret: string; master: string; callbackKey: string; media: string; data: string; origins: string[]; localAdmin?: string; localChannel: string; production: boolean; }
export function createApp(o: Options) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && o.origins.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Local-Admin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });
  app.use(express.json({ limit: '8kb' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-7', legacyHeaders: false }));
  const validId = (id: string) => /^\d{1,20}$/.test(id);
  async function get(id: string): Promise<ChannelConfig> {
    try { return configSchema.parse(JSON.parse(await readFile(path.join(o.data, `${id}.json`), 'utf8'))); }
    catch (e: any) { if (e.code === 'ENOENT') return structuredClone(defaults); throw e; }
  }
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/channels/:id', async (req, res) => {
    if (!validId(req.params.id)) { res.sendStatus(400); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.json(await get(req.params.id));
  });
  app.use('/api/admin/:id', async (req, res, next) => {
    const id = req.params.id;
    if (!validId(id)) { res.sendStatus(400); return; }
    // Development access is explicit, single-channel, and absent in production.
    if (!o.production && o.localAdmin && id === o.localChannel && equal(req.get('X-Local-Admin') || '', o.localAdmin)) { next(); return; }
    try { await broadcaster((req.get('Authorization') || '').replace(/^Bearer /, ''), id, o.secret); next(); }
    catch { res.sendStatus(403); }
  });
  let writes = Promise.resolve();
  app.put('/api/admin/:id', async (req, res) => {
    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Некорректные настройки' }); return; }
    const id = req.params.id;
    const operation = writes.catch(() => {}).then(async () => {
      await mkdir(o.data, { recursive: true });
      const file = path.join(o.data, `${id}.json`);
      await writeFile(`${file}.tmp`, JSON.stringify(parsed.data), { mode: 0o600 });
      await rename(`${file}.tmp`, file);
    });
    writes = operation;
    await operation;
    res.json(parsed.data);
  });
  app.get('/api/admin/:id/ingest', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ path: `cam/${req.params.id}`, user: req.params.id, password: publishKey(o.master, req.params.id), token: `${req.params.id}.${publishKey(o.master, req.params.id)}` });
  });
  app.post('/internal/media-auth', (req, res) => {
    if (!equal(String(req.query.key || ''), o.callbackKey)) { res.sendStatus(403); return; }
    const b = req.body, match = /^cam\/(\d{1,20})$/.exec(String(b.path));
    if (!match) { res.sendStatus(403); return; }
    const id = match[1];
    const publish = b.action === 'publish' && ((b.user === id && equal(String(b.password || ''), publishKey(o.master, id))) || equal(String(b.token || ''), `${id}.${publishKey(o.master, id)}`));
    const read = b.action === 'read' && b.user === 'backend' && equal(String(b.password || ''), o.callbackKey);
    res.sendStatus(publish || read ? 204 : 403);
  });
  // Camera video is public when enabled, just like the broadcast. Publisher credentials never leave this proxy.
  app.get('/media/:id/:file', async (req, res) => {
    const { id, file } = req.params;
    if (!validId(id) || !/^[a-zA-Z0-9_.-]+\.(m3u8|mp4|m4s|ts)$/.test(file)) { res.sendStatus(400); return; }
    if (!(await get(id)).enabled) { res.sendStatus(404); return; }
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const upstreamUrl = new URL(`${o.media}/cam/${id}/${file}`);
      // MediaMTX HLS playlists carry a server-generated session identifier.
      if (typeof req.query.session === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(req.query.session)) upstreamUrl.searchParams.set('session', req.query.session);
      const options = { signal: controller.signal, redirect: 'manual' as const, headers: { Authorization: `Basic ${Buffer.from(`backend:${o.callbackKey}`).toString('base64')}` } };
      let upstream = await fetch(upstreamUrl, options);
      for (let redirects = 0; upstream.status >= 300 && upstream.status < 400 && redirects < 3; redirects++) {
        const location = upstream.headers.get('location');
        if (!location) throw new Error('Missing media redirect location');
        const next = new URL(location, upstream.url);
        if (next.origin !== upstreamUrl.origin || !next.pathname.startsWith(`/cam/${id}/`)) throw new Error('Unsafe media redirect');
        await upstream.body?.cancel();
        upstream = await fetch(next, options);
      }
      if (upstream.status >= 300 && upstream.status < 400) throw new Error('Too many media redirects');
      res.status(upstream.status);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
      if (upstream.body) { const stream = Readable.fromWeb(upstream.body as any); stream.on('error', () => res.destroy()); stream.pipe(res); }
      else res.end();
    } catch (err) { console.error('Media upstream unavailable:', err instanceof Error ? err.message : 'unknown', (err as any)?.cause?.message || '', (err as any)?.cause?.cause?.message || ''); if (!res.headersSent) res.sendStatus(503); }
    finally { clearTimeout(timeout); }
  });
  app.use(express.static(path.resolve('dist')));
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { console.error('Request failed:', err instanceof Error ? err.message : 'unknown'); if (!res.headersSent) res.status(500).json({ error: 'Ошибка сервера' }); });
  return app;
}
