import 'dotenv/config';
import { createApp } from './app.js';
const required = (name: string) => { const v = process.env[name]; if (!v || v.length < 32) throw new Error(`${name}: требуется секрет минимум 32 символа; npm run setup`); return v; };
const production = process.env.NODE_ENV === 'production';
if (production && Buffer.from(process.env.TWITCH_EXTENSION_SECRET || '', 'base64').length < 32) throw new Error('Production requires a valid base64 TWITCH_EXTENSION_SECRET (at least 32 decoded bytes).');
const app = createApp({ secret: process.env.TWITCH_EXTENSION_SECRET || '', master: required('PUBLISH_MASTER_SECRET'), callbackKey: required('MEDIA_AUTH_SECRET'), media: process.env.MEDIA_INTERNAL_URL || 'http://127.0.0.1:8888', data: process.env.DATA_DIR || './data', origins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(','), localAdmin: production ? undefined : required('LOCAL_ADMIN_SECRET'), localChannel: process.env.LOCAL_CHANNEL_ID || '1', production });
const server = app.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log('Freecam backend ready'));
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => server.close());
