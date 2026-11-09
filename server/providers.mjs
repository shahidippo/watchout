import { z } from 'zod';
const ROOT='https://portal.data.nsw.gov.au/arcgis/rest/services/Hosted/TFNSW_Speed_Cameras_public/FeatureServer';
export const SOURCES={cameras:{name:'Transport for NSW — fixed camera register',url:ROOT,attribution:'Transport for NSW / NSW Government. Source rights must be confirmed before public redistribution.',cadenceSeconds:86400},traffic:{name:'Transport for NSW — Live Traffic Hazards',url:'https://opendata.transport.nsw.gov.au/data/dataset/live-traffic-hazards',attribution:'Transport for NSW, Live Traffic NSW',cadenceSeconds:120}};
const feature=z.object({geometry:z.object({x:z.number().min(140).max(154),y:z.number().min(-38).max(-28)}),attributes:z.record(z.string(),z.unknown())});
export async function fetchJSON(url, options={}) {
  const r=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});
  if(!r.ok) throw new Error(`Provider HTTP ${r.status}`);
  return r.json();
}
export async function fetchCameras(fetcher=fetchJSON) {
  const meta=await fetcher(`${ROOT}?f=json`);
  if(meta.error||!Array.isArray(meta.layers)) throw new Error('Camera service metadata unavailable');
  const items=[];
  for(const [id,kind] of [[0,'fixed_speed_camera'],[2,'red_light_speed_camera']]) {
    if(!meta.layers.some(l=>l.id===id)) throw new Error(`Camera layer ${id} missing; operator review required`);
    const info=await fetcher(`${ROOT}/${id}?f=json`);
    if(info.error||!info.fields?.length) throw new Error('Camera schema missing');
    const key=info.objectIdField||info.fields.find(f=>f.type==='esriFieldTypeOID')?.name;
    if(!key) throw new Error('Camera object ID field unavailable');
    let offset=0;
    for(let page=0;page<100;page++) {
      const q=new URLSearchParams({f:'json',where:'1=1',outFields:'*',outSR:'4326',returnGeometry:'true',resultOffset:String(offset),resultRecordCount:'500',orderByFields:key});
      const data=await fetcher(`${ROOT}/${id}/query?${q}`);
      if(data.error||data.spatialReference?.wkid!==4326||!Array.isArray(data.features)) throw new Error('Camera export schema or coordinate system invalid');
      for(const raw of data.features) {
        const f=feature.parse(raw),a=f.attributes;
        if(a[key]===undefined||a[key]===null) throw new Error('Missing camera identifier');
        items.push({id:`nsw-${id}-${a[key]}`,kind,latitude:f.geometry.y,longitude:f.geometry.x,title:kind==='fixed_speed_camera'?'Fixed speed camera':'Red-light speed camera',source:SOURCES.cameras.name,sourceUrl:ROOT,sourceObservedAt:info.editingInfo?.lastEditDate?new Date(info.editingInfo.lastEditDate).toISOString():null});
      }
      offset+=data.features.length;
      if(!data.exceededTransferLimit) break;
      if(!data.features.length||page===99) throw new Error('Incomplete camera export');
    }
  }
  if(!items.length) throw new Error('Unexpected empty camera export; retaining last valid snapshot');
  if(new Set(items.map(i=>i.id)).size!==items.length) throw new Error('Duplicate camera identifiers');
  return {items,sourceTime:meta.editingInfo?.lastEditDate?new Date(meta.editingInfo.lastEditDate).toISOString():null};
}
export function normalizeTraffic(data, now=Date.now()) {
  if(!Array.isArray(data.features)) throw new Error('Invalid traffic feed');
  const items=[];
  for(const f of data.features) {
    const p=f.properties||{}, c=f.geometry?.coordinates;
    if(!Array.isArray(c)||c.length<2||!Number.isFinite(c[0])||!Number.isFinite(c[1])||Math.abs(c[0])>180||Math.abs(c[1])>90) throw new Error('Invalid traffic coordinates');
    if(p.isEnded===true) continue;
    const updated=typeof p.lastUpdated==='number'?p.lastUpdated:Date.parse(p.lastUpdated);
    if(!Number.isFinite(updated)||updated>now+60000||now-updated>24*3600000) continue;
    const id=f.id??p.id;
    if(id===undefined) throw new Error('Traffic identifier missing');
    const title=String(p.headline||p.mainCategory||'Official road advisory').slice(0,240);
    items.push({id:`tfnsw-${id}`,kind:'official_road_advisory',title,latitude:c[1],longitude:c[0],source:SOURCES.traffic.name,sourceUrl:'https://www.livetraffic.com/',sourceObservedAt:new Date(updated).toISOString(),expiresAt:new Date(Math.min(now+120000,updated+86400000)).toISOString()});
  }
  return {items,sourceTime:null};
}
export async function syncProvider(db,provider,loader) {
  const now=new Date().toISOString();
  try {
    const data=await loader();
    db.prepare('INSERT OR REPLACE INTO snapshots VALUES(?,?,?,?,?)').run(provider,JSON.stringify(data.items),data.sourceTime,now,data.items.length);
    db.prepare('INSERT OR REPLACE INTO provider_health VALUES(?,?,NULL)').run(provider,now);
    return {ok:true,count:data.items.length};
  } catch(e) {
    // Keep errors generic; never store URLs with credentials or provider response bodies.
    db.prepare('INSERT OR REPLACE INTO provider_health VALUES(?,?,?)').run(provider,now,'Source request or schema validation failed');
    return {ok:false,error:'Source request or schema validation failed'};
  }
}
export function coverage(db,now=Date.now()) {
  return Object.entries(SOURCES).map(([id,s])=>{
    const snap=db.prepare('SELECT * FROM snapshots WHERE provider=?').get(id), health=db.prepare('SELECT * FROM provider_health WHERE provider=?').get(id);
    const stale=snap && now-Date.parse(snap.fetched_at)>s.cadenceSeconds*1000;
    return {id,...s,region:'NSW',status:!snap?'unavailable':stale||health?.error?'stale':snap.count?'current':'empty',count:snap?.count??null,lastSuccessfulContact:snap?.fetched_at??null,sourceObservedAt:snap?.source_time??null,lastAttempt:health?.checked_at??null,error:health?.error??(!snap?'Not yet provisioned or synced':null)};
  }).concat([{id:'aircraft',name:'Civil aircraft overhead',region:'NSW',status:'unavailable',count:null,error:'Requires a licensed civil-only production data provider and verified adapter. Not configured.',attribution:null,lastSuccessfulContact:null},{id:'police',name:'Official police notices',region:'NSW',status:'unsupported',count:null,error:'No verified current agency notice feed or editorial workflow configured.',attribution:null,lastSuccessfulContact:null}]);
}
