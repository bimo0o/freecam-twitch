// Clip the movable camera around visible player controls. Holes also pass input
// through to controls underneath, without changing Twitch's stacking contexts.
export function guardPlayerControls({host,camera,root}){
  let pending=false,closed=false,last='';
  const selectors='button,a[href],input,select,[role="button"],[role="slider"],[role="menu"],[role="menuitem"],[data-a-target="player-controls"],.player-controls';
  function visible(element){
    if(!element.getClientRects().length)return false;
    for(let node=element;node&&node!==root.parentElement;node=node.parentElement){
      const style=getComputedStyle(node);
      if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;
    }
    return true;
  }
  function update(){
    pending=false;if(closed||host.hidden)return;
    const box=camera.getBoundingClientRect();if(!box.width||!box.height)return;
    let path=`M0 0H${box.width}V${box.height}H0Z`;
    // Merge overlapping exclusions into a single grid union. Separate overlapping
    // evenodd holes would accidentally restore pointer capture at intersections.
    const rectangles=[];
    for(const element of root.querySelectorAll(selectors)){
      if(element===host||host.contains(element)||!visible(element))continue;
      const r=element.getBoundingClientRect(),x=Math.max(0,r.left-box.left-2),y=Math.max(0,r.top-box.top-2),right=Math.min(box.width,r.right-box.left+2),bottom=Math.min(box.height,r.bottom-box.top+2);
      if(right>x&&bottom>y)rectangles.push({x,y,right,bottom});
    }
    const xs=[...new Set(rectangles.flatMap(r=>[r.x,r.right]))].sort((a,b)=>a-b);
    for(let i=0;i<xs.length-1;i++){
      const x=xs[i],right=xs[i+1],bands=rectangles.filter(r=>r.x<=x&&r.right>=right).map(r=>[r.y,r.bottom]).sort((a,b)=>a[0]-b[0]),merged=[];
      for(const band of bands){const previous=merged.at(-1);if(previous&&band[0]<=previous[1])previous[1]=Math.max(previous[1],band[1]);else merged.push([...band]);}
      for(const [y,bottom]of merged)path+=`M${x} ${y}H${right}V${bottom}H${x}Z`;
    }
    const clip=rectangles.length?`path(evenodd, "${path}")`:'none';
    if(clip!==last){camera.style.clipPath=clip;last=clip;}
  }
  function schedule(){if(!closed&&!pending){pending=true;requestAnimationFrame(update);}}
  root.addEventListener('pointermove',schedule,true);root.addEventListener('focusin',schedule,true);
  window.addEventListener('resize',schedule);document.addEventListener('fullscreenchange',schedule);
  const timer=setInterval(schedule,150);schedule();
  return {schedule,close(){closed=true;clearInterval(timer);root.removeEventListener('pointermove',schedule,true);root.removeEventListener('focusin',schedule,true);window.removeEventListener('resize',schedule);document.removeEventListener('fullscreenchange',schedule);}};
}
