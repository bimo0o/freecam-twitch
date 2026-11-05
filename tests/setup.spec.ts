import {test,expect} from '@playwright/test';
test('streamer setup authenticates locally and prepares a verified scene without storing the password',async({page})=>{
  const commands:string[]=[];const transforms=new Map();const inputSettings=new Map();const items=new Map<string,any[]>();let id=0;let video={baseWidth:1280,baseHeight:720,outputWidth:1280,outputHeight:720};
  await page.routeWebSocket('ws://127.0.0.1:4455',ws=>{
    ws.onMessage(message=>{const p=JSON.parse(String(message));if(p.op===1){expect(typeof p.d.authentication).toBe('string');ws.send(JSON.stringify({op:2,d:{negotiatedRpcVersion:1}}));return;}
      if(p.op!==6)return;const t=p.d.requestType,d=p.d.requestData;commands.push(t);let response:any={};
      if(t==='GetInputList')response={inputs:[{inputName:'My Game',inputKind:'game_capture'},{inputName:'My Camera',inputKind:'dshow_input'},...[...inputSettings.keys()].map(inputName=>({inputName,inputKind:'browser_source'}))]};
      else if(t==='GetStreamStatus'||t==='GetRecordStatus')response={outputActive:false};
      else if(t==='GetInputKindList')response={inputKinds:['color_source_v3','browser_source']};
      else if(t==='GetVideoSettings')response={...video};
      else if(t==='SetVideoSettings')video={...video,...d};
      else if(t==='GetCurrentProgramScene')response={currentProgramSceneName:'Original'};
      else if(t==='GetSceneList')response={currentProgramSceneName:'Original',scenes:[{sceneName:'Original'}]};
      else if(t==='GetSceneItemList')response={sceneItems:items.get(d.sceneName)||[]};
      else if(t==='GetSourceFilterList')response={filters:[]};
      else if(t==='CreateScene')items.set(d.sceneName,[]);
      else if(t==='SetInputSettings')inputSettings.set(d.inputName,{...inputSettings.get(d.inputName),...d.inputSettings});
      else if(t==='GetInputSettings')response={inputSettings:inputSettings.get(d.inputName)};
      else if(t==='CreateInput'||t==='CreateSceneItem'){if(t==='CreateInput')inputSettings.set(d.inputName,d.inputSettings);response={sceneItemId:++id};items.get(d.sceneName)?.push({sceneItemId:id,sourceName:d.sourceName||d.inputName});}
      else if(t==='SetSceneItemTransform')transforms.set(d.sceneItemId,d.sceneItemTransform);
      else if(t==='GetSceneItemTransform')response={sceneItemTransform:transforms.get(d.sceneItemId)};
      ws.send(JSON.stringify({op:7,d:{requestId:p.d.requestId,requestStatus:{result:true,code:100},responseData:response}}));
    });
    ws.send(JSON.stringify({op:0,d:{rpcVersion:1,authentication:{salt:'test-salt',challenge:'test-challenge'}}}));
  });
  await page.goto(process.env.FREECAM_SETUP_URL||'/setup.html');await page.getByLabel('Пароль OBS').fill('test-only-password');await page.getByRole('button',{name:'Подключить OBS'}).click();
  await expect(page.getByRole('status')).toHaveText('OBS подключён. Выберите сцену и камеру.');
  await expect(page.getByLabel('Пароль OBS')).toHaveValue('');
  await expect(page.getByLabel('Сцена для копирования')).toHaveValue('Original');
  await expect(page.getByLabel('Источник игры')).toBeHidden();
  await page.getByRole('button',{name:'Подготовить и открыть сцену'}).click();
  await expect(page.getByRole('status')).toContainText('Сцена «Freecam» готова.');
  expect(commands).not.toContain('StartStream');expect(commands).toContain('GetSceneItemTransform');
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('test-only-password');
  const sceneCount=commands.filter(v=>v==='CreateScene').length;
  await page.getByRole('button',{name:'Восстановить подсказки Freecam'}).click();
  await expect(page.getByRole('status')).toContainText('Подсказок восстановлено: 1');
  expect(commands).toContain('PressInputPropertiesButton');expect(commands.filter(v=>v==='CreateScene')).toHaveLength(sceneCount);
  await page.screenshot({path:'test-results/streamer-setup.png',fullPage:true});
});
