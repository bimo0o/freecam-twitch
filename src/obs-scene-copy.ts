import type {ObsApi} from './obs-client';
type Item={sourceName:string;sceneItemId:number;sceneItemIndex:number;sceneItemEnabled:boolean;sceneItemLocked:boolean;isGroup?:boolean;sourceType?:string;sceneItemTransform:any;child?:Plan;blend?:string};
type Plan={name:string;group:boolean;items:Item[];filters:any[];containsCamera:boolean;cameraTransform?:any};
// Read the complete dependency tree before making changes. Only containers on a
// camera path need independent copies; all other widget sources remain shared.
export async function inspectScene(obs:ObsApi,name:string,camera:string,group=false,path=new Set<string>()):Promise<Plan>{
  if(path.has(name))throw Error('В сцене обнаружена циклическая вложенность.');
  const next=new Set(path).add(name);
  const {sceneItems}=await obs.request(group?'GetGroupSceneItemList':'GetSceneItemList',{sceneName:name});
  const items:Item[]=[];let containsCamera=false,cameraTransform:any;
  for(const raw of [...sceneItems].sort((a,b)=>a.sceneItemIndex-b.sceneItemIndex)){
    if(raw.sourceName===camera){containsCamera=true;cameraTransform??=raw.sceneItemTransform;continue;}
    const item:Item={...raw};
    if(item.isGroup||item.sourceType==='OBS_SOURCE_TYPE_SCENE'){
      const child=await inspectScene(obs,item.sourceName,camera,!!item.isGroup,next);
      cameraTransform??=child.cameraTransform;
      if(child.containsCamera){item.child=child;containsCamera=true;}
    }
    items.push(item);
  }
  const {filters}=await obs.request('GetSourceFilterList',{sourceName:name});
  return {name,group,items,filters,containsCamera,cameraTransform};
}
export async function copyScene(obs:ObsApi,plan:Plan,prefix:string,created:string[],canvas:{width:number;height:number},counter={value:0}):Promise<string>{
  const name=`${prefix} · ${++counter.value} ${plan.name}`;
  await obs.request('CreateScene',{sceneName:name});created.push(name);
  for(const item of plan.items){
    let id:number;
    if(item.child){
      const childName=await copyScene(obs,item.child,prefix,created,canvas,counter);
      const added=await obs.request('CreateSceneItem',{sceneName:name,sourceName:childName,sceneItemEnabled:item.sceneItemEnabled});id=added.sceneItemId;
      const t={...item.sceneItemTransform};
      // A group copy uses an ordinary scene as its isolated container. Crop the
      // extra canvas so its local coordinate system and parent transform match.
      if(item.isGroup){
        const w=t.sourceWidth,h=t.sourceHeight;
        if(!Number.isFinite(w)||!Number.isFinite(h)||w>canvas.width||h>canvas.height)throw Error('Группа камеры больше холста OBS. Вынесите камеру на верхний уровень сцены и повторите.');
        t.cropRight=(t.cropRight||0)+canvas.width-w;t.cropBottom=(t.cropBottom||0)+canvas.height-h;
      }
      await obs.request('SetSceneItemTransform',{sceneName:name,sceneItemId:id,sceneItemTransform:t});
    }else{
      id=(await obs.request('CreateSceneItem',{sceneName:name,sourceName:item.sourceName,sceneItemEnabled:item.sceneItemEnabled})).sceneItemId;
      await obs.request('SetSceneItemTransform',{sceneName:name,sceneItemId:id,sceneItemTransform:item.sceneItemTransform});
    }
    const {sceneItemBlendMode}=await obs.request('GetSceneItemBlendMode',{sceneName:plan.name,sceneItemId:item.sceneItemId});
    await obs.request('SetSceneItemBlendMode',{sceneName:name,sceneItemId:id,sceneItemBlendMode});
    await obs.request('SetSceneItemLocked',{sceneName:name,sceneItemId:id,sceneItemLocked:item.sceneItemLocked});
  }
  for(const filter of [...plan.filters].sort((a,b)=>a.filterIndex-b.filterIndex)){
    await obs.request('CreateSourceFilter',{sourceName:name,filterName:filter.filterName,filterKind:filter.filterKind,filterSettings:filter.filterSettings});
    await obs.request('SetSourceFilterEnabled',{sourceName:name,filterName:filter.filterName,filterEnabled:filter.filterEnabled});
  }
  return name;
}
