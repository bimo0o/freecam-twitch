import {test,expect} from '@playwright/test';
test('streamer setup authenticates locally and prepares a verified scene without storing the password',async({page})=>{
  const commands:string[]=[];const transforms=new Map();let id=0;let video={baseWidth:1280,baseHeight:720,outputWidth:1280,outputHeight:720};
  await page.routeWebSocket('ws://127.0.0.1:4455',ws=>{
    ws.onMessage(message=>{const p=JSON.parse(String(message));if(p.op===1){expect(typeof p.d.authentication).toBe('string');ws.send(JSON.stringify({op:2,d:{negotiatedRpcVersion:1}}));return;}
      if(p.op!==6)return;const t=p.d.requestType,d=p.d.requestData;commands.push(t);let response:any={};
      if(t==='GetInputList')response={inputs:[{inputName:'My Game',inputKind:'game_capture'},{inputName:'My Camera',inputKind:'dshow_input'}]};
      else if(t==='GetStreamStatus'||t==='GetRecordStatus')response={outputActive:false};
      else if(t==='GetInputKindList')response={inputKinds:['color_source_v3','text_gdiplus_v2']};
      else if(t==='GetVideoSettings')response={...video};
      else if(t==='SetVideoSettings')video=d;
      else if(t==='GetCurrentProgramScene')response={currentProgramSceneName:'Original'};
      else if(t==='GetSceneList')response={scenes:[{sceneName:'Original'}]};
      else if(t==='CreateInput'||t==='CreateSceneItem')response={sceneItemId:++id};
      else if(t==='SetSceneItemTransform')transforms.set(d.sceneItemId,d.sceneItemTransform);
      else if(t==='GetSceneItemTransform')response={sceneItemTransform:transforms.get(d.sceneItemId)};
      ws.send(JSON.stringify({op:7,d:{requestId:p.d.requestId,requestStatus:{result:true,code:100},responseData:response}}));
    });
    ws.send(JSON.stringify({op:0,d:{rpcVersion:1,authentication:{salt:'test-salt',challenge:'test-challenge'}}}));
  });
  await page.goto('/setup.html');await page.getByLabel('Пароль OBS').fill('test-only-password');await page.getByRole('button',{name:'Подключить OBS'}).click();
  await expect(page.getByRole('status')).toHaveText('OBS подключён. Выберите источники.');
  await expect(page.getByLabel('Пароль OBS')).toHaveValue('');
  await page.getByRole('button',{name:'Подготовить и открыть сцену'}).click();
  await expect(page.getByRole('status')).toContainText('Сцена «Freecam» готова.');
  expect(commands).not.toContain('StartStream');expect(commands).toContain('GetSceneItemTransform');
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('test-only-password');
  await page.screenshot({path:'test-results/streamer-setup.png',fullPage:true});
});
