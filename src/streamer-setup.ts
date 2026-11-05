import {ObsClient} from './obs-client';
import {prepareObs} from './obs-setup';
const obs=new ObsClient();const status=document.getElementById('status')!;
const game=document.getElementById('game') as HTMLSelectElement,camera=document.getElementById('camera') as HTMLSelectElement;
const connect=document.getElementById('connect') as HTMLButtonElement,prepare=document.getElementById('prepare') as HTMLButtonElement;
connect.onclick=async()=>{connect.disabled=true;status.textContent='Подключение…';try{
  await obs.connect((document.getElementById('password') as HTMLInputElement).value,Number((document.getElementById('port') as HTMLInputElement).value));
  (document.getElementById('password') as HTMLInputElement).value='';
  const {inputs}=await obs.request('GetInputList');game.replaceChildren();camera.replaceChildren();
  for(const input of inputs.filter((v:any)=>!/(audio|wasapi|pulse|alsa|coreaudio)/i.test(v.inputKind)))for(const select of [game,camera]){const option=document.createElement('option');option.value=option.textContent=input.inputName;select.append(option);}
  if(camera.options.length>1)camera.selectedIndex=1;document.getElementById('sources')!.hidden=false;status.textContent='OBS подключён. Выберите источники.';
}catch(e){status.textContent=e instanceof Error?e.message:String(e);}finally{connect.disabled=false;}};
prepare.onclick=async()=>{prepare.disabled=true;status.textContent='Собираем сцену и проверяем расположение…';try{const result=await prepareObs(obs,game.value,camera.value);status.textContent=`Сцена «${result.sceneName}» готова. Расположение источников и разрешение проверены автоматически.\nПроверка воспроизведения на живом Twitch ещё не выполнена. Трансляция автоматически не запускается.`;}catch(e){status.textContent=e instanceof Error?e.message:String(e);}finally{prepare.disabled=false;}};
addEventListener('pagehide',()=>obs.close());
