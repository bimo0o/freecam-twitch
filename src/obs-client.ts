export interface ObsApi { request(type:string,data?:Record<string,unknown>):Promise<any>; }
const base64=(bytes:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
async function hash(text:string){return base64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));}
export class ObsClient implements ObsApi {
  private socket?:WebSocket;
  private pending=new Map<string,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  async connect(password:string,port=4455){
    if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Некорректный порт OBS');
    this.close();const socket=new WebSocket(`ws://127.0.0.1:${port}`);this.socket=socket;
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{socket.close();reject(Error('OBS не отвечает. Включите WebSocket Server в Tools → WebSocket Server Settings.'));},7000);
      socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Не удалось подключиться к OBS на этом компьютере.'));});
      socket.addEventListener('close',()=>{clearTimeout(timer);reject(Error('OBS закрыл подключение. Проверьте пароль.'));this.rejectPending();});
      socket.addEventListener('message',async event=>{
        try{const packet=JSON.parse(event.data);
          if(packet.op===0){const auth=packet.d.authentication;const authentication=auth?await hash((await hash(password+auth.salt))+auth.challenge):undefined;socket.send(JSON.stringify({op:1,d:{rpcVersion:1,eventSubscriptions:0,...(authentication?{authentication}:{})}}));}
          else if(packet.op===2){clearTimeout(timer);resolve();}
          else if(packet.op===7){const item=this.pending.get(packet.d.requestId);if(item){clearTimeout(item.timer);this.pending.delete(packet.d.requestId);packet.d.requestStatus.result?item.resolve(packet.d.responseData||{}):item.reject(Error(packet.d.requestStatus.comment||'OBS отклонил действие'));}}
        }catch{clearTimeout(timer);reject(Error('Некорректный ответ OBS'));}
      });
    });
  }
  request(type:string,data:Record<string,unknown>={}){return new Promise<any>((resolve,reject)=>{
    if(this.socket?.readyState!==WebSocket.OPEN){reject(Error('Подключение OBS закрыто'));return;}
    const id=crypto.randomUUID();const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`OBS не ответил: ${type}`));},7000);
    this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({op:6,d:{requestType:type,requestId:id,requestData:data}}));
  });}
  private rejectPending(){for(const v of this.pending.values()){clearTimeout(v.timer);v.reject(Error('Соединение OBS закрыто'));}this.pending.clear();}
  close(){this.socket?.close();this.socket=undefined;this.rejectPending();}
}
