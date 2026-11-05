import { jwtVerify } from 'jose';
import { createHmac, timingSafeEqual } from 'node:crypto';
export function equal(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function publishKey(master: string, channel: string) { return createHmac('sha256', master).update(`publish:${channel}`).digest('hex'); }
export async function broadcaster(token: string, channel: string, secret: string) {
  const { payload } = await jwtVerify(token, Buffer.from(secret, 'base64'), { algorithms: ['HS256'], requiredClaims: ['exp', 'channel_id', 'role', 'user_id'] });
  if (payload.role !== 'broadcaster' || payload.channel_id !== channel || payload.user_id !== channel) throw new Error('Forbidden');
  return payload;
}
