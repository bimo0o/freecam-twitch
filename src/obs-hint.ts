import type {ObsApi} from './obs-client';
export type HintLocation={hintFile?:string;hintUrl?:string;panelFile?:string};
export function hintSettings(location:HintLocation){
  if(!location.hintFile&&!location.hintUrl)throw Error('Путь к подсказке не получен. Перезапустите приложение Freecam.');
  return {width:1420,height:132,fps_custom:true,fps:30,shutdown:false,restart_when_active:false,...(location.hintFile?{is_local_file:true,local_file:location.hintFile}:{is_local_file:false,url:location.hintUrl})};
}
export async function checkHintSettings(obs:ObsApi,inputName:string,location:HintLocation){
  const {inputSettings:s}=await obs.request('GetInputSettings',{inputName});
  if(!s||s.width!==1420||s.height!==132||(location.hintFile?(!s.is_local_file||s.local_file!==location.hintFile):(s.is_local_file||s.url!==location.hintUrl)))throw Error('OBS не сохранил путь к подсказке. Нажмите «Восстановить подсказки Freecam».');
}
export async function repairHints(obs:ObsApi,location:HintLocation){
  const settings=hintSettings(location),{inputs}=await obs.request('GetInputList');
  const own=inputs.filter((v:any)=>v.inputKind==='browser_source'&&/^Freecam(?: \d+)? · [0-9a-f]{8} Подсказка$/.test(v.inputName));
  for(const input of own){
    await obs.request('SetInputSettings',{inputName:input.inputName,inputSettings:settings,overlay:true});
    await checkHintSettings(obs,input.inputName,location);
    await obs.request('PressInputPropertiesButton',{inputName:input.inputName,propertyName:'refreshnocache'});
  }
  return own.length;
}
