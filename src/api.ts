import { Capacitor, registerPlugin } from '@capacitor/core';
export const native=Capacitor.isNativePlatform();
export const Device=registerPlugin<{
  getSession():Promise<{value:string}>; setSession(o:{value:string}):Promise<void>;
  startDrive(o:{driveId:string}):Promise<void>; stopDrive():Promise<void>;
  driveState():Promise<{active:boolean;driveId:string;samples:any[]}>;
  acknowledge(o:{driveId:string;sequence:number}):Promise<void>;
}>('WatchoutDevice');
let session:{token:string;user:{id:string;username:string}}|null=null;
export const getSession=()=>session;
export async function restoreSession(){try{const raw=native?(await Device.getSession()).value:sessionStorage.getItem('watchout-session');session=raw?JSON.parse(raw):null;}catch{session=null;}return session;}
export async function storeSession(value:typeof session){session=value;const raw=value?JSON.stringify(value):'';if(native)await Device.setSession({value:raw});else if(value)sessionStorage.setItem('watchout-session',raw);else sessionStorage.removeItem('watchout-session');}
export function backend(){return localStorage.getItem('watchout-backend')||(native?'http://10.0.2.2:3000':'');}
export async function api(path:string,method='GET',data?:unknown):Promise<any>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{
 const r=await fetch(backend()+'/v1'+path,{method,headers:{...(data!==undefined?{'Content-Type':'application/json'}:{}),...(session?{Authorization:'Bearer '+session.token}:{})},body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal});
 const json=await r.json();if(!r.ok)throw Object.assign(new Error(json.error||'Request failed'),{status:r.status});return json;
 }catch(e){if(e instanceof TypeError||e instanceof DOMException)throw new Error('Cannot reach Watchout. Check your connection and backend address in Settings.');throw e;}finally{clearTimeout(timer);}
}
