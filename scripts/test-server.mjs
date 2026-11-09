import {createApp} from '../server/app.mjs';
const a=await createApp({dbPath:':memory:'});
await a.listen({host:'127.0.0.1',port:3001});
