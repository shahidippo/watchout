import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z, ZodError } from 'zod';
import { coverage, fetchCameras, fetchJSON, normalizeTraffic, syncProvider } from './providers.mjs';
import { summarize, distance } from './geo.mjs';
const scrypt=promisify(scryptCallback), now=()=>new Date().toISOString(), id=()=>randomUUID();
const text=(n=1000)=>z.string().trim().min(1).max(n), uuid=z.string().uuid();
const coords={latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)};
function fail(status,message){const e=new Error(message);e.statusCode=status;e.expose=true;throw e;}
export async function createApp(options={}) {
  if(process.env.NODE_ENV==='production' && (!process.env.PUBLIC_ORIGIN?.startsWith('https://')||process.env.DEMO_MODE)) throw new Error('Production requires HTTPS PUBLIC_ORIGIN; demo mode is forbidden');
  const dbPath=options.dbPath||process.env.DATABASE_PATH||'data/watchout.sqlite';
  if(dbPath!==':memory:') mkdirSync(dirname(resolve(dbPath)),{recursive:true});
  const db=new DatabaseSync(dbPath);db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  const app=Fastify({logger:options.logger??false,bodyLimit:256*1024,trustProxy:false});
  app.decorate('db',db);
  await app.register(cors,{origin:(origin,cb)=>cb(null,!origin||['https://localhost','http://localhost','http://localhost:5173','http://127.0.0.1:5173',process.env.PUBLIC_ORIGIN].includes(origin)),methods:['GET','POST','PUT','DELETE']});
  await app.register(helmet,{contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','https://tile.openstreetmap.org'],connectSrc:["'self'"],objectSrc:["'none'"],baseUri:["'self'"]}}});
  await app.register(rateLimit,{max:300,timeWindow:'1 minute'});
  app.setErrorHandler((e,req,reply)=>{
    if(e instanceof ZodError) return reply.code(400).send({error:'Please check the form fields.',fields:e.issues.map(i=>({path:i.path.join('.'),message:i.message}))});
    const status=e.statusCode||500;
    reply.code(status).send({error:status<500||e.expose?e.message:'Service temporarily unavailable. Please retry.'});
  });
  const user=req=>{
    const token=req.headers.authorization?.replace(/^Bearer /,'');
    if(!token||token.length>200) fail(401,'Sign in to continue.');
    const row=db.prepare('SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>?').get(createHash('sha256').update(token).digest('hex'),now());
    if(!row) fail(401,'Your session expired. Please sign in again.');return row;
  };
  const optionalUser=req=>req.headers.authorization?user(req):null;
  const allowed=(viewer,owner)=>!viewer||!db.prepare('SELECT 1 FROM blocks WHERE (owner_id=? AND blocked_id=?) OR (owner_id=? AND blocked_id=?)').get(viewer,owner,owner,viewer);
  const own=(table,objectId,owner)=>{
    const row=db.prepare(`SELECT * FROM ${table} WHERE id=? AND owner_id=?`).get(objectId,owner);
    if(!row) fail(404,'Item not found.');return row;
  };
  const member=(roomId,uid)=>{
    const room=db.prepare('SELECT r.* FROM rooms r JOIN room_members m ON m.room_id=r.id WHERE r.id=? AND m.user_id=?').get(roomId,uid);
    if(!room||!allowed(uid,room.owner_id)) fail(404,'Convoy not found.');if(room.closed_at) fail(410,'This convoy has ended. Its chat is closed.');return room;
  };
  const session=uid=>{
    const token=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+30*86400000).toISOString();
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),uid,expiresAt);
    return {token,expiresAt,user:db.prepare('SELECT id,username FROM users WHERE id=?').get(uid)};
  };
  app.get('/v1/health',async()=>({ok:true,version:'0.1.0',database:db.prepare('SELECT max(version) AS version FROM migrations').get(),serverTime:now()}));
  app.post('/v1/auth/register',{config:{rateLimit:{max:10,timeWindow:'1 hour'}}},async req=>{
    const b=z.object({username:z.string().regex(/^[A-Za-z][A-Za-z0-9_]{2,23}$/),password:z.string().min(12).max(128)}).parse(req.body);
    if(db.prepare('SELECT 1 FROM users WHERE canonical=?').get(b.username.toLowerCase())) fail(409,'That username is already taken.');
    const salt=randomBytes(16).toString('hex'),hash=(await scrypt(b.password,salt,64)).toString('hex'),uid=id();
    // Hashing yields; recheck uniqueness inside the write.
    try{db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(uid,b.username,b.username.toLowerCase(),`${salt}:${hash}`,now());}catch(e){if(e.code?.includes('CONSTRAINT')) fail(409,'That username is already taken.');throw e;}
    return session(uid);
  });
  app.post('/v1/auth/login',{config:{rateLimit:{max:20,timeWindow:'15 minutes'}}},async req=>{
    const b=z.object({username:text(24),password:z.string().min(1).max(128)}).parse(req.body),u=db.prepare('SELECT * FROM users WHERE canonical=?').get(b.username.toLowerCase());
    const [salt,stored]=u?u.password.split(':'):['dummy-salt','00'.repeat(64)],hash=await scrypt(b.password,salt,64);
    if(!u||!timingSafeEqual(hash,Buffer.from(stored,'hex'))) fail(401,'Username or password is incorrect.');
    return session(u.id);
  });
  app.post('/v1/auth/logout',async req=>{user(req);db.prepare('DELETE FROM sessions WHERE token_hash=?').run(createHash('sha256').update(req.headers.authorization.slice(7)).digest('hex'));return {ok:true};});
  app.get('/v1/me',async req=>({...user(req),visibility:'ghost',emailVerification:'not_configured',billing:'not_configured'}));
  app.post('/v1/me/deletion',async req=>{
    const u=user(req),b=z.object({password:text(128)}).parse(req.body),record=db.prepare('SELECT password FROM users WHERE id=?').get(u.id),[salt,stored]=record.password.split(':');
    if(!timingSafeEqual(await scrypt(b.password,salt,64),Buffer.from(stored,'hex'))) fail(401,'Password is incorrect.');
    db.prepare('DELETE FROM users WHERE id=?').run(u.id);return {ok:true,deleted:'primary_database',backupRetention:'Up to 30 days if operator backups are enabled.'};
  });
  app.put('/v1/me/blocks/:id',async req=>{
    const u=user(req),blocked=uuid.parse(req.params.id);if(blocked===u.id) fail(400,'Cannot block yourself.');
    if(!db.prepare('SELECT 1 FROM users WHERE id=?').get(blocked)) fail(404,'Account not found.');
    db.prepare('INSERT OR IGNORE INTO blocks VALUES(?,?)').run(u.id,blocked);return {ok:true};
  });
  app.get('/v1/vehicles',async req=>{
    const u=user(req),owner=req.query.owner?uuid.parse(req.query.owner):u.id;
    if(!allowed(u.id,owner)) return {items:[]};
    return {items:db.prepare(`SELECT id,owner_id,make,model,year,nickname,description,visibility,active,created_at FROM vehicles WHERE owner_id=? ${owner===u.id?'':"AND visibility='public'"} ORDER BY active DESC,created_at DESC`).all(owner)};
  });
  app.post('/v1/vehicles',async req=>{
    const u=user(req),b=z.object({make:text(60),model:text(80),year:z.number().int().min(1900).max(new Date().getUTCFullYear()+1),nickname:z.string().trim().max(60).default(''),description:z.string().trim().max(2000).default(''),visibility:z.enum(['private','public']).default('private')}).parse(req.body),vid=id();
    db.prepare('INSERT INTO vehicles VALUES(?,?,?,?,?,?,?,?,?,?)').run(vid,u.id,b.make,b.model,b.year,b.nickname,b.description,b.visibility,db.prepare('SELECT 1 FROM vehicles WHERE owner_id=?').get(u.id)?0:1,now());return {id:vid,...b};
  });
  app.put('/v1/vehicles/:id',async req=>{
    const u=user(req);own('vehicles',req.params.id,u.id);const b=z.object({visibility:z.enum(['private','public']).optional(),active:z.boolean().optional()}).parse(req.body);
    db.exec('BEGIN');try{if(b.active){db.prepare('UPDATE vehicles SET active=0 WHERE owner_id=?').run(u.id);db.prepare('UPDATE vehicles SET active=1 WHERE id=?').run(req.params.id);}if(b.visibility)db.prepare('UPDATE vehicles SET visibility=? WHERE id=?').run(b.visibility,req.params.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return {ok:true};
  });
  app.delete('/v1/vehicles/:id',async req=>{const u=user(req);own('vehicles',req.params.id,u.id);db.prepare('DELETE FROM vehicles WHERE id=?').run(req.params.id);return {ok:true};});
  app.get('/v1/posts',async req=>{
    const u=optionalUser(req),cursor=req.query.before?z.string().datetime().parse(req.query.before):now();
    const items=db.prepare('SELECT p.*,u.username FROM posts p JOIN users u ON u.id=p.author_id WHERE p.created_at<? ORDER BY p.created_at DESC,p.id DESC LIMIT 100').all(cursor).filter(p=>allowed(u?.id,p.author_id)).slice(0,30);
    return {items,nextCursor:items.length===30?items.at(-1).created_at:null};
  });
  app.post('/v1/posts',async req=>{const u=user(req),b=z.object({body:text(2000)}).parse(req.body),pid=id();db.prepare('INSERT INTO posts VALUES(?,?,?,?)').run(pid,u.id,b.body,now());return {id:pid};});
  app.delete('/v1/posts/:id',async req=>{const u=user(req);const r=db.prepare('DELETE FROM posts WHERE id=? AND author_id=?').run(req.params.id,u.id);if(!r.changes)fail(404,'Post not found.');return {ok:true};});
  app.get('/v1/events',async req=>{
    const u=optionalUser(req),time=now();return {items:db.prepare(`SELECT e.*,u.username,(SELECT count(*) FROM rsvps r WHERE r.event_id=e.id) AS attendees,(SELECT count(*) FROM rsvps r WHERE r.event_id=e.id AND r.user_id=?) AS going FROM events e JOIN users u ON u.id=e.owner_id WHERE e.ends_at>? AND e.state NOT IN ('ended','cancelled') ORDER BY e.starts_at LIMIT 100`).all(u?.id??'',time).filter(e=>allowed(u?.id,e.owner_id)).map(e=>({...e,state:e.starts_at<=time?'live':'scheduled'}))};
  });
  app.post('/v1/events',async req=>{
    const u=user(req),b=z.object({title:text(100),kind:z.enum(['meet','cruise','show','rally']),description:z.string().trim().max(2000).default(''),...coords,venue:text(150),startsAt:z.string().datetime(),endsAt:z.string().datetime(),timezone:text(80).default('Australia/Sydney')}).parse(req.body);
    try{new Intl.DateTimeFormat('en',{timeZone:b.timezone});}catch{fail(400,'Use a valid IANA timezone.');}
    if(Date.parse(b.endsAt)<=Date.parse(b.startsAt)||Date.parse(b.endsAt)<=Date.now())fail(400,'End time must be after the start and in the future.');
    const eid=id();db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(eid,u.id,b.title,b.kind,b.description,b.latitude,b.longitude,b.venue,b.startsAt,b.endsAt,b.timezone,'scheduled',now());return {id:eid};
  });
  app.put('/v1/events/:id/rsvp',async req=>{
    const u=user(req),e=db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);if(!e||!allowed(u.id,e.owner_id))fail(404,'Event not found.');
    if(e.ends_at<=now()||['ended','cancelled'].includes(e.state)) fail(410,'This event has ended.');
    const {going}=z.object({going:z.boolean()}).parse(req.body);if(going)db.prepare('INSERT OR IGNORE INTO rsvps VALUES(?,?)').run(e.id,u.id);else db.prepare('DELETE FROM rsvps WHERE event_id=? AND user_id=?').run(e.id,u.id);return {ok:true};
  });
  app.post('/v1/events/:id/end',async req=>{const u=user(req);own('events',req.params.id,u.id);db.prepare("UPDATE events SET state='ended' WHERE id=?").run(req.params.id);return {ok:true};});
  app.get('/v1/search',{config:{rateLimit:{max:12,timeWindow:'1 minute'}}},async req=>{
    const q=text(120).parse(req.query.q);
    try{const data=await fetchJSON(`${process.env.GEOCODER_URL||'https://nominatim.openstreetmap.org'}/search?${new URLSearchParams({q,format:'jsonv2',limit:'5',countrycodes:'au',addressdetails:'1'})}`,{headers:{'User-Agent':process.env.PROVIDER_USER_AGENT||'Watchout/0.1 (development; single-user search)'}});
      return {items:z.array(z.object({place_id:z.union([z.number(),z.string()]),display_name:z.string(),lat:z.string(),lon:z.string()})).parse(data).map(p=>({id:String(p.place_id),title:p.display_name,latitude:Number(p.lat),longitude:Number(p.lon),source:'OpenStreetMap / Nominatim'})),attribution:'© OpenStreetMap contributors; Nominatim'};
    }catch{fail(503,'Address search is unavailable. Check the geocoding provider or enter coordinates.');}
  });
  app.post('/v1/routes/preview',{config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async req=>{
    const b=z.object({points:z.array(z.object(coords)).min(2).max(10)}).parse(req.body);
    try{const data=await fetchJSON(`${process.env.ROUTER_URL||'https://router.project-osrm.org'}/route/v1/driving/${b.points.map(p=>`${p.longitude},${p.latitude}`).join(';')}?overview=full&geometries=geojson&steps=true`);
      const r=data.routes?.[0];if(data.code!=='Ok'||!r?.geometry?.coordinates||!Number.isFinite(r.distance)||!Number.isFinite(r.duration))throw Error('No route');
      return {points:b.points,geometry:r.geometry,distanceMetres:r.distance,durationSeconds:r.duration,legs:r.legs,source:'OSRM / OpenStreetMap',traffic:'not_available',calculatedAt:now()};
    }catch{fail(503,'Road routing is unavailable. Your waypoints are preserved; retry when the provider is available.');}
  });
  app.post('/v1/routes',async req=>{const u=user(req),b=z.object({title:text(100),route:z.object({points:z.array(z.object(coords)).min(2).max(10),geometry:z.object({type:z.literal('LineString'),coordinates:z.array(z.tuple([z.number().min(-180).max(180),z.number().min(-90).max(90)])).min(2).max(20000)}),distanceMetres:z.number().nonnegative(),durationSeconds:z.number().nonnegative(),source:text(100),calculatedAt:z.string().datetime()})}).parse(req.body),rid=id();db.prepare('INSERT INTO routes VALUES(?,?,?,?,?)').run(rid,u.id,b.title,JSON.stringify({...b.route,provenance:'user_saved_provider_geometry; not server-verified for rewards'}),now());return {id:rid};});
  app.get('/v1/routes',async req=>{const u=user(req);return {items:db.prepare('SELECT * FROM routes WHERE owner_id=? ORDER BY created_at DESC LIMIT 100').all(u.id).map(r=>({...r,payload:JSON.parse(r.payload)}))};});
  app.post('/v1/drives',async req=>{
    const u=user(req),b=z.object({vehicleId:uuid.nullable().optional()}).parse(req.body||{});if(b.vehicleId)own('vehicles',b.vehicleId,u.id);
    const active=db.prepare('SELECT * FROM drives WHERE owner_id=? AND finished_at IS NULL').get(u.id);if(active)return active;
    const did=id();db.prepare('INSERT INTO drives VALUES(?,?,?,?,NULL)').run(did,u.id,b.vehicleId??null,now());return db.prepare('SELECT * FROM drives WHERE id=?').get(did);
  });
  app.post('/v1/drives/:id/batches',async req=>{
    const u=user(req),d=own('drives',req.params.id,u.id);if(d.finished_at)fail(409,'This drive is already finished.');
    const b=z.object({samples:z.array(z.object({sequence:z.number().int().min(0).max(1000000),observedAt:z.string().datetime(),...coords,accuracy:z.number().min(0).max(10000),speed:z.number().min(0).max(150).nullable().optional()})).min(1).max(500)}).parse(req.body);
    for(const s of b.samples) if(Date.parse(s.observedAt)>Date.now()+60000||Date.parse(s.observedAt)<Date.parse(d.started_at)-60000)fail(400,'Sample timestamp is outside this drive.');
    db.exec('BEGIN');try{
      for(const s of b.samples){const prior=db.prepare('SELECT * FROM samples WHERE drive_id=? AND sequence=?').get(d.id,s.sequence);if(prior&&(prior.latitude!==s.latitude||prior.longitude!==s.longitude||prior.observed_at!==s.observedAt))fail(409,'Sequence already contains a different sample.');db.prepare('INSERT OR IGNORE INTO samples VALUES(?,?,?,?,?,?,?)').run(d.id,s.sequence,s.observedAt,s.latitude,s.longitude,s.accuracy,s.speed??null);}
      db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    return {accepted:b.samples.map(s=>s.sequence)};
  });
  app.post('/v1/drives/:id/finish',async req=>{const u=user(req);own('drives',req.params.id,u.id);db.prepare('UPDATE drives SET finished_at=COALESCE(finished_at,?) WHERE id=?').run(now(),req.params.id);return {...db.prepare('SELECT * FROM drives WHERE id=?').get(req.params.id),...summarize(db.prepare('SELECT * FROM samples WHERE drive_id=? ORDER BY sequence').all(req.params.id))};});
  app.get('/v1/drives/:id/samples',async req=>{const u=user(req);own('drives',req.params.id,u.id);return {items:db.prepare('SELECT sequence,observed_at,latitude,longitude,accuracy,speed FROM samples WHERE drive_id=? ORDER BY sequence').all(req.params.id)};});
  app.get('/v1/drives',async req=>{const u=user(req);return {items:db.prepare('SELECT * FROM drives WHERE owner_id=? ORDER BY started_at DESC LIMIT 100').all(u.id).map(d=>({...d,...summarize(db.prepare('SELECT * FROM samples WHERE drive_id=? ORDER BY sequence').all(d.id))}))};});
  app.get('/v1/rooms',async req=>{const u=user(req);return {items:db.prepare('SELECT r.* FROM rooms r JOIN room_members m ON m.room_id=r.id WHERE m.user_id=? AND r.closed_at IS NULL ORDER BY r.created_at DESC').all(u.id).filter(r=>allowed(u.id,r.owner_id))};});
  app.post('/v1/rooms',async req=>{const u=user(req),b=z.object({name:text(60)}).parse(req.body),rid=id(),code=randomBytes(9).toString('base64url');db.exec('BEGIN');try{db.prepare('INSERT INTO rooms VALUES(?,?,?,?,NULL,?)').run(rid,u.id,b.name,code,now());db.prepare('INSERT INTO room_members VALUES(?,?)').run(rid,u.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return {id:rid,code};});
  app.post('/v1/rooms/join',async req=>{const u=user(req),b=z.object({code:text(30)}).parse(req.body),r=db.prepare('SELECT * FROM rooms WHERE code=? AND closed_at IS NULL').get(b.code);if(!r||!allowed(u.id,r.owner_id))fail(404,'Invite is invalid or this convoy ended.');db.prepare('INSERT OR IGNORE INTO room_members VALUES(?,?)').run(r.id,u.id);return {id:r.id};});
  app.post('/v1/rooms/:id/leave',async req=>{const u=user(req),r=member(req.params.id,u.id);if(r.owner_id===u.id)fail(400,'As host, end the convoy instead.');db.prepare('DELETE FROM room_members WHERE room_id=? AND user_id=?').run(r.id,u.id);return {ok:true};});
  app.post('/v1/rooms/:id/end',async req=>{const u=user(req);own('rooms',req.params.id,u.id);db.exec('BEGIN');try{db.prepare('UPDATE rooms SET closed_at=COALESCE(closed_at,?) WHERE id=?').run(now(),req.params.id);db.prepare('DELETE FROM messages WHERE room_id=?').run(req.params.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return {ok:true};});
  app.get('/v1/rooms/:id/messages',async req=>{const u=user(req),r=member(req.params.id,u.id),after=z.coerce.number().int().min(0).parse(req.query.after||0);return {items:db.prepare('SELECT m.*,u.username FROM messages m JOIN users u ON u.id=m.author_id WHERE room_id=? AND m.id>? ORDER BY m.id LIMIT 100').all(r.id,after).filter(m=>allowed(u.id,m.author_id))};});
  app.post('/v1/rooms/:id/messages',async req=>{const u=user(req),r=member(req.params.id,u.id),b=z.object({body:text(2000),clientMessageId:uuid}).parse(req.body);if(!allowed(u.id,r.owner_id))fail(403,'This conversation is unavailable.');db.prepare('INSERT OR IGNORE INTO messages(room_id,author_id,client_id,body,created_at) VALUES(?,?,?,?,?)').run(r.id,u.id,b.clientMessageId,b.body,now());return db.prepare('SELECT id,created_at FROM messages WHERE room_id=? AND author_id=? AND client_id=?').get(r.id,u.id,b.clientMessageId);});
  app.post('/v1/reports',async req=>{const u=user(req),b=z.object({kind:z.enum(['crash','obstruction']),description:z.string().trim().max(500).default(''),...coords,observedAt:z.string().datetime()}).parse(req.body);if(Math.abs(Date.now()-Date.parse(b.observedAt))>15*60000)fail(400,'Report a current observation within 15 minutes.');const rid=id();db.prepare('INSERT INTO reports VALUES(?,?,?,?,?,?,?,?)').run(rid,u.id,b.kind,b.description,b.latitude,b.longitude,b.observedAt,new Date(Date.parse(b.observedAt)+3600000).toISOString());return {id:rid};});
  app.delete('/v1/reports/:id',async req=>{const u=user(req);const r=db.prepare('DELETE FROM reports WHERE id=? AND author_id=?').run(req.params.id,u.id);if(!r.changes)fail(404,'Report not found.');return {ok:true};});
  app.get('/v1/coverage',async()=>({items:coverage(db),maps:{source:'OpenStreetMap',usage:'Public tile and demo routing services for development only; provision production capacity.'},serverTime:now()}));
  app.get('/v1/map',async req=>{
    const q=z.object({latitude:z.coerce.number().min(-90).max(90).default(-33.8688),longitude:z.coerce.number().min(-180).max(180).default(151.2093),radius:z.coerce.number().min(500).max(100000).default(25000)}).parse(req.query),u=optionalUser(req),items=[];
    const health=coverage(db);
    for(const p of ['cameras','traffic']){const snap=db.prepare('SELECT payload FROM snapshots WHERE provider=?').get(p);if(!snap)continue;const h=health.find(x=>x.id===p);if(p==='traffic'&&h.status!=='current'&&h.status!=='empty')continue;for(const item of JSON.parse(snap.payload)){if(item.expiresAt&&item.expiresAt<now())continue;if(distance(q,item)<=q.radius)items.push({...item,coverageStatus:h.status,fetchedAt:h.lastSuccessfulContact});}}
    for(const r of db.prepare('SELECT * FROM reports WHERE expires_at>? LIMIT 500').all(now()))if(allowed(u?.id,r.author_id)&&distance(q,r)<=q.radius)items.push({id:r.id,kind:'community_'+r.kind,title:r.kind==='crash'?'Community crash report':'Community obstruction report',latitude:r.latitude,longitude:r.longitude,description:r.description,source:'Watchout user report — unverified',canWithdraw:r.author_id===u?.id,sourceObservedAt:r.observed_at,expiresAt:r.expires_at});
    return {items:items.slice(0,2000),coverage:health,serverTime:now(),radiusMetres:q.radius};
  });
  app.get('/v1/airspace/nearby',async req=>{user(req);return {status:'unavailable',items:[],reason:'Licensed eligible civil-aircraft provider not provisioned.'};});
  app.get('/v1/public-advisories',async()=>({status:'unsupported',items:[],reason:'Verified current agency notice workflow not configured.'}));
  app.decorate('syncSources',async()=>{
    const existing=db.prepare("SELECT fetched_at FROM snapshots WHERE provider='cameras'").get();
    const rights=process.env.NODE_ENV!=='production'||process.env.NSW_CAMERA_RIGHTS_CONFIRMED==='true';
    const cameras=!rights?{ok:false,error:'Confirm agency rights before enabling production camera import'}:existing&&Date.now()-Date.parse(existing.fetched_at)<86400000?{ok:true,cached:true}:await syncProvider(db,'cameras',()=>fetchCameras());
    let traffic={ok:false,error:'TFNSW_API_KEY not configured'};
    if(process.env.TFNSW_API_KEY)traffic=await syncProvider(db,'traffic',async()=>normalizeTraffic(await fetchJSON('https://api.transport.nsw.gov.au/v1/live/hazards/incident/open',{headers:{Authorization:`apikey ${process.env.TFNSW_API_KEY}`}})));
    return {cameras,traffic};
  });
  const dist=resolve('dist');if(options.serveStatic!==false&&existsSync(dist)){await app.register(staticFiles,{root:dist});app.setNotFoundHandler((req,reply)=>req.url.startsWith('/v1/')?reply.code(404).send({error:'Endpoint not found.'}):reply.sendFile('index.html'));}
  app.addHook('onClose',async()=>db.close());
  return app;
}
