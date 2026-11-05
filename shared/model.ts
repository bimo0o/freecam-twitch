import { z } from 'zod';
export const placementSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(.12).max(.65) });
export const configSchema = z.object({
  enabled: z.boolean(), login: z.string().regex(/^[a-zA-Z0-9_]{1,25}$/),
  placement: placementSchema, aspect: z.enum(['16:9', '4:3']),
  delay: z.number().min(2).max(90), autoSync: z.boolean(),
  quality: z.enum(['480p', '720p', '1080p']), fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
  bitrate: z.number().int().min(200).max(6000)
}).strict();
export type ChannelConfig = z.infer<typeof configSchema>;
export type Placement = z.infer<typeof placementSchema>;
export const defaults: ChannelConfig = { enabled: false, login: 'channel', placement: { x: .96, y: .94, width: .25 }, aspect: '16:9', delay: 6, autoSync: true, quality: '720p', fps: 30, bitrate: 1200 };
export function geometry(p: Placement, w: number, h: number, aspect: number) {
  const width = Math.min(w * Math.max(.12, Math.min(.65, p.width)), h * aspect);
  const height = width / aspect;
  return { width, height, left: Math.max(0, w - width) * p.x, top: Math.max(0, h - height) * p.y };
}
export function syncTarget(edge: number, start: number, delay: number) {
  return Math.max(start + .1, edge - Math.max(2, Math.min(90, delay)));
}
