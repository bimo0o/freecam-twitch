import type {ObsApi} from './obs-client';
export async function prepareObs(obs:ObsApi,game:string,camera:string){
  if(!game||!camera||game===camera)throw Error('Выберите разные источники игры и камеры.');
  const stream=await obs.request('GetStreamStatus'),record=await obs.request('GetRecordStatus');
  if(stream.outputActive||record.outputActive)throw Error('Сначала остановите эфир и запись: подготовка меняет разрешение OBS.');
  const inputs=await obs.request('GetInputList');if(![game,camera].every(name=>inputs.inputs.some((v:any)=>v.inputName===name)))throw Error('Источник больше не существует в OBS.');
  const {inputKinds}=await obs.request('GetInputKindList');const color=inputKinds.find((v:string)=>v.startsWith('color_source'));
  const text=inputKinds.find((v:string)=>v.startsWith('text_gdiplus'))||inputKinds.find((v:string)=>v.startsWith('text_ft2'));
  if(!color||!text)throw Error('В OBS не найдены источники цвета или текста.');
  const previousVideo=await obs.request('GetVideoSettings');const previousScene=(await obs.request('GetCurrentProgramScene')).currentProgramSceneName;
  const {scenes}=await obs.request('GetSceneList');let name='Freecam';let i=2;while(scenes.some((s:any)=>s.sceneName===name))name=`Freecam ${i++}`;
  const prefix=`${name} · ${crypto.randomUUID().slice(0,8)}`;const created:string[]=[];let sceneCreated=false,videoChanged=false;
  const place=async(id:number,x:number,y:number,w:number,h:number)=>{
    await obs.request('SetSceneItemTransform',{sceneName:name,sceneItemId:id,sceneItemTransform:{positionX:x,positionY:y,rotation:0,alignment:5,boundsType:'OBS_BOUNDS_SCALE_INNER',boundsAlignment:0,boundsWidth:w,boundsHeight:h,cropLeft:0,cropTop:0,cropRight:0,cropBottom:0}});
    const {sceneItemTransform:t}=await obs.request('GetSceneItemTransform',{sceneName:name,sceneItemId:id});
    if(Math.abs(t.positionX-x)>.5||Math.abs(t.positionY-y)>.5||Math.abs(t.boundsWidth-w)>.5||Math.abs(t.boundsHeight-h)>.5)throw Error('OBS не применил расположение источника.');
  };
  const input=async(label:string,kind:string,settings:Record<string,unknown>,x:number,y:number,w:number,h:number)=>{
    const inputName=`${prefix} ${label}`;const result=await obs.request('CreateInput',{sceneName:name,inputName,inputKind:kind,inputSettings:settings,sceneItemEnabled:true});created.push(inputName);await place(result.sceneItemId,x,y,w,h);
  };
  try{
    await obs.request('CreateScene',{sceneName:name});sceneCreated=true;
    await obs.request('SetVideoSettings',{baseWidth:1920,baseHeight:1080,outputWidth:1920,outputHeight:1080});videoChanged=true;
    await input('Фон',color,{color:0xff181011,width:1920,height:1080},0,0,1920,1080);
    for(const [source,x,y,w,h]of [[game,0,0,1600,900],[camera,1600,900,320,180]] as const){const item=await obs.request('CreateSceneItem',{sceneName:name,sourceName:source,sceneItemEnabled:true});await place(item.sceneItemId,x,y,w,h);}
    for(const [label,x,y,value]of [['М1',1504,1016,0xff00ff00],['М2',1528,1016,0xffff00ff],['М3',1504,1040,0xffffff00],['М4',1528,1040,0xffffffff]] as const)await input(label,color,{color:value,width:24,height:24},x,y,24,24);
    await input('Установка',text,{text:'Установите Freecam — перемещайте вебку\ngithub.com/bimo0o/freecam-twitch\nChrome / Edge → значок расширений → Freecam',font:{face:'Arial',size:28,flags:0},color:0xfff1dcff,outline:true,outline_size:1},32,930,1420,132);
    const video=await obs.request('GetVideoSettings');if(video.baseWidth!==1920||video.outputWidth!==1920||video.baseHeight!==1080||video.outputHeight!==1080)throw Error('OBS не применил разрешение 1080p.');
    await obs.request('SetCurrentProgramScene',{sceneName:name});
    return {sceneName:name,verified:true,previousVideo,previousScene};
  }catch(error){
    // Roll back only the scene/inputs created in this transaction; never delete selected user sources.
    if(sceneCreated){await obs.request('SetCurrentProgramScene',{sceneName:previousScene}).catch(()=>{});await obs.request('RemoveScene',{sceneName:name}).catch(()=>{});}
    for(const inputName of created)await obs.request('RemoveInput',{inputName}).catch(()=>{});
    if(videoChanged)await obs.request('SetVideoSettings',{baseWidth:previousVideo.baseWidth,baseHeight:previousVideo.baseHeight,outputWidth:previousVideo.outputWidth,outputHeight:previousVideo.outputHeight}).catch(()=>{});
    throw error;
  }
}
