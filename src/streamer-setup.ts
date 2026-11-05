import {ObsClient} from './obs-client';
import {prepareObs} from './obs-setup';
import {repairHints,type HintLocation} from './obs-hint';
const obs=new ObsClient();const status=document.getElementById('status')!;
const game=document.getElementById('game') as HTMLSelectElement,camera=document.getElementById('camera') as HTMLSelectElement;
const scene=document.getElementById('scene') as HTMLSelectElement;
scene.onchange=()=>{document.getElementById('game-field')!.hidden=!!scene.value;};
const connect=document.getElementById('connect') as HTMLButtonElement,prepare=document.getElementById('prepare') as HTMLButtonElement;
const repair=document.getElementById('repair-hints') as HTMLButtonElement;
async function loadHintLocation():Promise<HintLocation>{
  try{
    const response=await fetch('/runtime.json',{cache:'no-store'});
    if(response.ok){const runtime=await response.json() as {obsHintPath?:string;hintReady?:boolean};
      if(runtime.hintReady&&typeof runtime.obsHintPath==='string'&&runtime.obsHintPath)return {hintFile:runtime.obsHintPath};
      throw Error('Подсказка приложения не прошла проверку. Перезапустите Freecam.');
    }
  }catch(error){if(document.documentElement.dataset.freecamDesktop)throw error;}
  if(document.documentElement.dataset.freecamDesktop)throw Error('Приложение не подтвердило файл подсказки. Перезапустите Freecam; сцену пока не меняем.');
  return {hintUrl:new URL('/obs-hint.html',location.href).href};
}
connect.onclick=async()=>{connect.disabled=true;status.textContent='Подключение…';try{
  await obs.connect((document.getElementById('password') as HTMLInputElement).value,Number((document.getElementById('port') as HTMLInputElement).value));
  (document.getElementById('password') as HTMLInputElement).value='';
  const {inputs}=await obs.request('GetInputList');game.replaceChildren();camera.replaceChildren();
  const sceneList=await obs.request('GetSceneList');scene.replaceChildren(new Option('Новая сцена — только игра и камера',''));
  for(const entry of sceneList.scenes.filter((v:any)=>!/^Freecam(?: \d+)?(?: ·|$)/.test(v.sceneName)))scene.add(new Option(entry.sceneName,entry.sceneName));
  if(scene.options.length>1)scene.value=[...scene.options].some(v=>v.value===sceneList.currentProgramSceneName)?sceneList.currentProgramSceneName:scene.options[1].value;
  scene.dispatchEvent(new Event('change'));
  for(const input of inputs.filter((v:any)=>!/(audio|wasapi|pulse|alsa|coreaudio)/i.test(v.inputKind)))for(const select of [game,camera]){const option=document.createElement('option');option.value=option.textContent=input.inputName;select.append(option);}
  if(camera.options.length>1)camera.selectedIndex=1;const webcam=inputs.find((v:any)=>/dshow|av_capture|v4l2/.test(v.inputKind));if(webcam)camera.value=webcam.inputName;document.getElementById('sources')!.hidden=false;document.getElementById('hint-repair')!.hidden=false;status.textContent='OBS подключён. Выберите сцену и камеру.';
}catch(e){status.textContent=e instanceof Error?e.message:String(e);}finally{connect.disabled=false;}};
prepare.onclick=async()=>{prepare.disabled=true;status.textContent='Копируем оформление и проверяем расположение…';try{
  const hint=await loadHintLocation();
  const result=await prepareObs(obs,game.value,camera.value,{sceneName:scene.value||undefined,...hint});status.textContent=`Сцена «${result.sceneName}» готова. Вся композиция вписана в область стрима, камера передаётся отдельно.\nФайл подсказки и путь в OBS проверены. Исходная сцена сохранена. Трансляция автоматически не запускается. Проверка на живом Twitch ещё не выполнена.`;
}catch(e){status.textContent=e instanceof Error?e.message:String(e);}finally{prepare.disabled=false;}};
repair.onclick=async()=>{repair.disabled=true;status.textContent='Проверяем файл и восстанавливаем пути подсказок…';try{
  const hint=await loadHintLocation();const count=await repairHints(obs,hint);
  status.textContent=count?`Подсказок восстановлено: ${count}. Файл и сохранённый путь в OBS проверены. Сцены пересоздавать не нужно.\n${hint.hintFile||hint.hintUrl}`:'Подсказок Freecam пока нет. Сначала подготовьте сцену.';
}catch(e){status.textContent=e instanceof Error?e.message:String(e);}finally{repair.disabled=false;}};
addEventListener('pagehide',()=>obs.close());
