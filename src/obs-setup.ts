import type {ObsApi} from './obs-client';
import {inspectScene,copyScene} from './obs-scene-copy';
export async function prepareObs(obs:ObsApi,game:string,camera:string,options:{sceneName?:string;hintFile?:string;hintUrl?:string}={}){
  if(!camera||(!options.sceneName&&(!game||game===camera)))throw Error('Выберите сцену или источник игры и отдельный источник камеры.');
  const stream=await obs.request('GetStreamStatus'),record=await obs.request('GetRecordStatus');
  if(stream.outputActive||record.outputActive)throw Error('Сначала остановите эфир и запись: подготовка меняет разрешение OBS.');
  const inputs=await obs.request('GetInputList');if(!(options.sceneName?[camera]:[game,camera]).every(name=>inputs.inputs.some((v:any)=>v.inputName===name)))throw Error('Источник больше не существует в OBS.');
  const {inputKinds}=await obs.request('GetInputKindList');const color=inputKinds.find((v:string)=>v.startsWith('color_source'));
  const browser=inputKinds.find((v:string)=>v==='browser_source');
  if(!color||!browser)throw Error('В OBS не найдены источники цвета или Browser / Браузер. Нужен OBS с установленным источником браузера.');
  const previousVideo=await obs.request('GetVideoSettings');const previousScene=(await obs.request('GetCurrentProgramScene')).currentProgramSceneName;
  const {scenes}=await obs.request('GetSceneList');let name='Freecam';let i=2;while(scenes.some((s:any)=>s.sceneName===name))name=`Freecam ${i++}`;
  if(Math.abs(previousVideo.baseWidth/previousVideo.baseHeight-16/9)>.01)throw Error('Для Freecam нужен холст OBS 16:9. Измените его в Settings / Настройки → Video / Видео перед подготовкой.');
  if(options.sceneName&&!scenes.some((s:any)=>s.sceneName===options.sceneName))throw Error('Выбранная сцена больше не существует. Подключитесь к OBS заново.');
  const plan=options.sceneName?await inspectScene(obs,options.sceneName,camera):undefined;
  const prefix=`${name} · ${crypto.randomUUID().slice(0,8)}`;const created:string[]=[],copiedScenes:string[]=[];let sceneCreated=false,videoChanged=false;
  // Preserve the original canvas so nested scenes/groups retain their dimensions.
  // All packed coordinates scale together; OBS encodes that canvas as 1920x1080.
  const sx=previousVideo.baseWidth/1920,sy=previousVideo.baseHeight/1080;
  const place=async(id:number,x:number,y:number,w:number,h:number)=>{
    x*=sx;y*=sy;w*=sx;h*=sy;
    await obs.request('SetSceneItemTransform',{sceneName:name,sceneItemId:id,sceneItemTransform:{positionX:x,positionY:y,rotation:0,alignment:5,boundsType:'OBS_BOUNDS_SCALE_INNER',boundsAlignment:0,boundsWidth:w,boundsHeight:h,cropLeft:0,cropTop:0,cropRight:0,cropBottom:0}});
    const {sceneItemTransform:t}=await obs.request('GetSceneItemTransform',{sceneName:name,sceneItemId:id});
    if(Math.abs(t.positionX-x)>.5||Math.abs(t.positionY-y)>.5||Math.abs(t.boundsWidth-w)>.5||Math.abs(t.boundsHeight-h)>.5)throw Error('OBS не применил расположение источника.');
  };
  const input=async(label:string,kind:string,settings:Record<string,unknown>,x:number,y:number,w:number,h:number)=>{
    const inputName=`${prefix} ${label}`;const result=await obs.request('CreateInput',{sceneName:name,inputName,inputKind:kind,inputSettings:settings,sceneItemEnabled:true});created.push(inputName);await place(result.sceneItemId,x,y,w,h);
  };
  try{
    await obs.request('CreateScene',{sceneName:name});sceneCreated=true;
    await obs.request('SetVideoSettings',{outputWidth:1920,outputHeight:1080});videoChanged=true;
    await input('Фон',color,{color:0xff181011,width:1920,height:1080},0,0,1920,1080);
    const composed=plan?await copyScene(obs,plan,prefix,copiedScenes,{width:previousVideo.baseWidth,height:previousVideo.baseHeight}):game;
    for(const [source,x,y,w,h]of [[composed,0,0,1600,900],[camera,1600,900,320,180]] as const){const item=await obs.request('CreateSceneItem',{sceneName:name,sourceName:source,sceneItemEnabled:true});await place(item.sceneItemId,x,y,w,h);}
    if(plan?.cameraTransform){
      const {sceneItems}=await obs.request('GetSceneItemList',{sceneName:name});const cam=sceneItems.find((v:any)=>v.sourceName===camera);
      const t=plan.cameraTransform;
      await obs.request('SetSceneItemTransform',{sceneName:name,sceneItemId:cam.sceneItemId,sceneItemTransform:{cropLeft:t.cropLeft||0,cropTop:t.cropTop||0,cropRight:t.cropRight||0,cropBottom:t.cropBottom||0}});
    }
    for(const [label,x,y,value]of [['М1',1504,1016,0xff00ff00],['М2',1528,1016,0xffff00ff],['М3',1504,1040,0xffffff00],['М4',1528,1040,0xffffffff]] as const)await input(label,color,{color:value,width:24,height:24},x,y,24,24);
    await input('Подсказка',browser,{width:1420,height:132,fps:30,shutdown:false,restart_when_active:false,...(options.hintFile?{is_local_file:true,local_file:options.hintFile}:{is_local_file:false,url:options.hintUrl||new URL('/obs-hint.html',location.href).href})},32,930,1420,132);
    const video=await obs.request('GetVideoSettings');if(video.baseWidth!==previousVideo.baseWidth||video.outputWidth!==1920||video.baseHeight!==previousVideo.baseHeight||video.outputHeight!==1080)throw Error('OBS не применил выход 1080p или изменил исходный холст.');
    await obs.request('SetCurrentProgramScene',{sceneName:name});
    return {sceneName:name,verified:true,previousVideo,previousScene};
  }catch(error){
    // Roll back only the scene/inputs created in this transaction; never delete selected user sources.
    if(sceneCreated){await obs.request('SetCurrentProgramScene',{sceneName:previousScene}).catch(()=>{});await obs.request('RemoveScene',{sceneName:name}).catch(()=>{});}
    for(const inputName of created)await obs.request('RemoveInput',{inputName}).catch(()=>{});
    for(const sceneName of [...copiedScenes].reverse())await obs.request('RemoveScene',{sceneName}).catch(()=>{});
    if(videoChanged)await obs.request('SetVideoSettings',{baseWidth:previousVideo.baseWidth,baseHeight:previousVideo.baseHeight,outputWidth:previousVideo.outputWidth,outputHeight:previousVideo.outputHeight}).catch(()=>{});
    throw error;
  }
}
