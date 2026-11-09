import {createApp} from '../server/app.mjs';
const a=await createApp({dbPath:':memory:',serveStatic:false});
const report={checkedAt:new Date().toISOString(),region:'Sydney / NSW',tests:[]};
const synced=await a.syncSources();
for(const [name,r] of Object.entries(synced))report.tests.push({source:name,status:r.ok?'passed':'blocked',...r});
for(const [name,path,method,payload] of [
 ['Sydney address search','/v1/search?q=Sydney%20Opera%20House','GET'],
 ['Sydney road route','/v1/routes/preview','POST',{points:[{latitude:-33.8688,longitude:151.2093},{latitude:-33.8568,longitude:151.2153}]}]
]){const r=await a.inject({url:path,method,payload});const body=r.json();report.tests.push({source:name,status:r.statusCode===200?'passed':'blocked',httpStatus:r.statusCode,records:body.items?.length,manoeuvres:body.legs?.flatMap(l=>l.steps).length,error:body.error});}
console.log(JSON.stringify(report,null,2));await a.close();if(report.tests.some(t=>t.status!=='passed'))process.exitCode=1;
