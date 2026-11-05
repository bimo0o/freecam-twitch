import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { geometry, defaults, configSchema, syncTarget } from '../shared/model.js';
import { broadcaster, publishKey } from '../server/auth.js';
import { createApp } from '../server/app.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
test('geometry stays bounded at all viewport sizes, positions and aspect ratios', () => {
  for (const [w,h] of [[1920,1080],[320,180],[200,700],[900,180]]) for (const aspect of [16/9,4/3]) for (const x of [0,.5,1]) for (const y of [0,.5,1]) for (const width of [.12,.25,.65]) {
    const g = geometry({x,y,width},w,h,aspect);
    assert.ok(g.left >= 0 && g.top >= 0 && g.left + g.width <= w + .001 && g.top + g.height <= h + .001);
    assert.ok(Math.abs(g.width/g.height-aspect)<.001);
  }
});
test('sync target clamps to available buffer', () => { assert.equal(syncTarget(120,0,6),114); assert.equal(syncTarget(10,5,60),5.1); });
test('config rejects injected URLs and nonfinite values', () => { assert.equal(configSchema.safeParse({...defaults,login:'https://evil'}).success,false); assert.equal(configSchema.safeParse({...defaults,delay:NaN}).success,false); });
test('JWT rejects wrong role, channel, signer, expiry and algorithm', async () => {
  const secret = Buffer.alloc(32,3), base = {role:'broadcaster',channel_id:'123',user_id:'123'};
  const sign = (payload: any, key = secret, alg='HS256', exp = Math.floor(Date.now()/1000)+60) => new SignJWT(payload).setProtectedHeader({alg}).setExpirationTime(exp).sign(key);
  await broadcaster(await sign(base),'123',secret.toString('base64'));
  for (const token of [await sign({...base,role:'viewer'}),await sign({...base,channel_id:'124'}),await sign({...base,user_id:'124'}),await sign(base,Buffer.alloc(32,4)),await sign(base,secret,'HS384'),await sign(base,secret,'HS256',1)]) await assert.rejects(broadcaster(token,'123',secret.toString('base64')));
});
test('server persists channel config, protects publishing, isolates channels and disables video', async () => {
  const data = await mkdtemp(path.join(tmpdir(),'freecam-'));
  const o = { secret:'',master:'a'.repeat(64),callbackKey:'b'.repeat(64),media:'http://127.0.0.1:9',data,origins:['https://allowed.example'],localAdmin:'dev-secret',localChannel:'123',production:false };
  const app = createApp(o), server = app.listen(0,'127.0.0.1');
  await new Promise<void>(r=>server.on('listening',r));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const put = (id: string,key: string,body: any) => fetch(`${url}/api/admin/${id}`,{method:'PUT',headers:{'Content-Type':'application/json','X-Local-Admin':key},body:JSON.stringify(body)});
    assert.equal((await put('123','bad',defaults)).status,403);
    assert.equal((await put('124','dev-secret',defaults)).status,403);
    assert.equal((await put('123','dev-secret',{...defaults,enabled:true})).status,200);
    assert.equal((await (await fetch(`${url}/api/channels/123`)).json()).enabled,true);
    assert.equal((await (await fetch(`${url}/api/channels/124`)).json()).enabled,false);
    const auth = (body: any) => fetch(`${url}/internal/media-auth?key=${o.callbackKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await auth({path:'cam/123',action:'publish',user:'123',password:publishKey(o.master,'123')})).status,204);
    assert.equal((await auth({path:'cam/124',action:'publish',user:'123',password:publishKey(o.master,'123')})).status,403);
    assert.equal((await auth({path:'cam/123',action:'read'})).status,403);
    assert.equal((await fetch(`${url}/media/124/index.m3u8`)).status,404);
    const r = await fetch(`${url}/api/channels/123`,{headers:{Origin:'https://allowed.example'}}); assert.equal(r.headers.get('access-control-allow-origin'),'https://allowed.example');
  } finally { await new Promise<void>(r=>server.close(()=>r())); await rm(data,{recursive:true,force:true}); }
});
test('HLS proxy follows same-origin session redirect and preserves playlist session queries', async () => {
  const data = await mkdtemp(path.join(tmpdir(),'freecam-proxy-'));
  const requests: string[] = [];
  const upstream = createServer((req,res)=>{
    requests.push(req.url!);
    if (!req.url!.includes('session=')) { res.writeHead(307,{location:'/cam/123/index.m3u8?session=abc-123'}); res.end(); }
    else { res.writeHead(200,{'content-type':'application/vnd.apple.mpegurl'}); res.end('#EXTM3U\nvideo1_stream.m3u8?session=abc-123\n'); }
  }).listen(0,'127.0.0.1');
  await new Promise<void>(r=>upstream.on('listening',r));
  const app = createApp({ secret:'',master:'a'.repeat(64),callbackKey:'b'.repeat(64),media:`http://127.0.0.1:${(upstream.address() as any).port}`,data,origins:[],localAdmin:'test-admin',localChannel:'123',production:false });
  const server = app.listen(0,'127.0.0.1'); await new Promise<void>(r=>server.on('listening',r));
  const url=`http://127.0.0.1:${(server.address() as any).port}`;
  try {
    await fetch(`${url}/api/admin/123`,{method:'PUT',headers:{'Content-Type':'application/json','X-Local-Admin':'test-admin'},body:JSON.stringify({...defaults,enabled:true})});
    const r=await fetch(`${url}/media/123/index.m3u8`); assert.equal(r.status,200); assert.ok((await r.text()).includes('session=abc-123'));
    await fetch(`${url}/media/123/video1_stream.m3u8?session=abc-123&password=should-not-forward`);
    assert.ok(requests.includes('/cam/123/video1_stream.m3u8?session=abc-123')); assert.ok(requests.every(v=>!v.includes('password=')));
  } finally { await Promise.all([new Promise<void>(r=>server.close(()=>r())),new Promise<void>(r=>upstream.close(()=>r()))]); await rm(data,{recursive:true,force:true}); }
});
