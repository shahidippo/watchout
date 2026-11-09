import { createApp } from './app.mjs';
const app=await createApp();
await app.listen({host:process.env.HOST||'0.0.0.0',port:Number(process.env.PORT||3000)});
console.log('Watchout API started; database ready. No user coordinates or request bodies are logged.');
let timer;
if(process.env.SYNC_SOURCES==='true'){
  const sync=async()=>{console.log('Source sync:',JSON.stringify(await app.syncSources()));};
  void sync();timer=setInterval(sync,120000);
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(timer)clearInterval(timer);await app.close();process.exit(0);});
