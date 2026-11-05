(() => {
  if(globalThis.FreecamPackedAuto) return;
  let attached,route='',disabled=false,busy=false,disposed=false;
  async function tick(){
    if(disposed||busy||document.hidden)return;busy=true;
    try{
      if(route!==location.pathname){route=location.pathname;attached=undefined;disabled=Boolean((await chrome.storage.local.get(`freecam-disabled:${route}`))[`freecam-disabled:${route}`]);}
      if(disabled)return;
      const video=[...document.querySelectorAll('video')].filter(v=>v.getBoundingClientRect().width>100).sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight)[0];
      if(video&&video.readyState>=2&&(video!==attached||!document.querySelector('[data-freecam-packed]'))){
        const result=globalThis.FreecamPackedController.start({silent:true});if(result.ok)attached=video;
      }
    }finally{busy=false;}
  }
  const timer=setInterval(tick,1000);
  globalThis.FreecamPackedAuto={disable:async value=>{disabled=value;await chrome.storage.local.set({[`freecam-disabled:${location.pathname}`]:value});if(value)globalThis.FreecamPackedController.stop();else{attached=undefined;void tick();}},stop:()=>{disposed=true;clearInterval(timer);}};
  void tick();
})();
