// Preserve reconstructed pixels while keeping native player controls above them.
export function guardPlayerControls({host,camera,root}){
  // Keep the complete restored frame. Raise native UI branches instead of
  // cutting holes that expose the original baked-in camera.
  const saved=new Map();let closed=false,pending=false;
  const selectors='button,a[href],input,select,[role="button"],[role="slider"],[role="menu"],[role="menuitem"],[data-a-target="player-controls"],.player-controls';
  function set(element,name,value){let record=saved.get(element);if(!record){record=new Map();saved.set(element,record);}if(!record.has(name))record.set(name,{before:element.style.getPropertyValue(name),priority:element.style.getPropertyPriority(name),value});element.style.setProperty(name,value);}
  function restore(element,record){for(const [name,p]of record)if(element.style.getPropertyValue(name)===p.value){if(p.before)element.style.setProperty(name,p.before,p.priority);else element.style.removeProperty(name);}}
  function update(){pending=false;if(closed)return;camera.style.clipPath='none';const active=new Set();
    if(!host.hidden)for(const element of root.querySelectorAll(selectors)){
      if(host.contains(element)||!element.getClientRects().length)continue;
      let layer=element;while(layer.parentElement&&layer.parentElement!==root&&!layer.parentElement.contains(host))layer=layer.parentElement;
      if(layer.contains(host))continue;
      active.add(layer);active.add(element);
      if(getComputedStyle(layer).position==='static')set(layer,'position','relative');
      set(layer,'z-index','2147483646');
      if(layer!==element)set(layer,'pointer-events','none');
      set(element,'pointer-events','auto');
    }
    for(const [element,record]of saved)if(!active.has(element)){restore(element,record);saved.delete(element);}
  }
  function schedule(){if(!closed&&!pending){pending=true;requestAnimationFrame(update);}}
  root.addEventListener('pointermove',schedule,true);root.addEventListener('focusin',schedule,true);window.addEventListener('resize',schedule);document.addEventListener('fullscreenchange',schedule);const timer=setInterval(schedule,150);schedule();
  return {schedule,close(){closed=true;clearInterval(timer);root.removeEventListener('pointermove',schedule,true);root.removeEventListener('focusin',schedule,true);window.removeEventListener('resize',schedule);document.removeEventListener('fullscreenchange',schedule);for(const [element,record]of saved)restore(element,record);saved.clear();camera.style.clipPath='none';}};
}
