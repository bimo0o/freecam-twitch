import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
  const page = await browser.newPage({viewport:{width:1000,height:720},deviceScaleFactor:1});
  const frame = (await readFile('docs/assets/obs-preview.png')).toString('base64');
  const font = (await readFile('public/brand/Manrope.ttf')).toString('base64');
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  @font-face{font-family:Manrope;src:url(data:font/ttf;base64,${font})}*{box-sizing:border-box}body{margin:0;background:#100c17;color:#f2edf7;font:14px Manrope,sans-serif;padding:24px}.window{border:1px solid #50415e;border-radius:12px;overflow:hidden;background:#19151f}.bar{height:43px;background:#241e2c;display:flex;align-items:center;justify-content:space-between;padding:0 18px;font-size:13px;color:#d0c3da}.bar span{color:#a991bc;font-size:11px}.preview{padding:14px 25px;background:#121016;display:flex;justify-content:center}.preview img{display:block;width:846px;height:476px;object-fit:contain}.docks{display:grid;grid-template-columns:1fr 1.3fr 1.2fr;border-top:1px solid #39303f;height:112px}.dock{padding:12px 16px;border-right:1px solid #39303f}.dock:last-child{border:0}h2{font-size:12px;margin:0 0 10px;color:#bda9cf;font-weight:600}.selected{background:#8554b133;color:#e5d0fa;border-left:2px solid #c79aff;padding:7px 10px;border-radius:3px}.items{display:flex;gap:16px;font-size:12px;padding-top:6px}.items span{color:#ded1e9}.meter{height:5px;background:#41364b;border-radius:4px;margin:8px 0}.meter i{display:block;width:64%;height:5px;background:linear-gradient(90deg,#8054b0,#c79aff);border-radius:4px}.voice{font-size:12px;color:#d8c9e3}.note{font-size:11px;color:#927c9f;display:flex;justify-content:space-between;margin:11px 4px 0}
  </style><div class="window"><div class="bar">OBS Studio <span>ПРИМЕР СЦЕНЫ</span></div><div class="preview"><img src="data:image/png;base64,${frame}" alt="Игра и вебка в обычном кадре"></div><div class="docks"><div class="dock"><h2>Сцены</h2><div class="selected">Основная сцена</div></div><div class="dock"><h2>Источники</h2><div class="items"><span>◉ Камера</span><span>▤ Чат</span><span>▣ Игра</span></div></div><div class="dock"><h2>Микшер звука</h2><div class="voice">Игра · Микрофон</div><div class="meter"><i></i></div></div></div></div><div class="note"><span>Обычный кадр для всей аудитории.</span><span>Данные Freecam — внутри видео.</span></div>`);
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('img').evaluate(img=>img.decode());
  await page.screenshot({path:'docs/assets/obs-scene-preview.png'});
} finally { await browser.close(); }
