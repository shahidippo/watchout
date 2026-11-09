export function distance(a, b) {
  const rad = Math.PI/180, lat = (b.latitude-a.latitude)*rad, lon = (b.longitude-a.longitude)*rad;
  const h = Math.sin(lat/2)**2 + Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(lon/2)**2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0,1-h)));
}
export function summarize(samples) {
  let metres=0, validSegments=0, gaps=0;
  for (let i=1;i<samples.length;i++) {
    const a=samples[i-1], b=samples[i], dt=(Date.parse(b.observed_at)-Date.parse(a.observed_at))/1000;
    const d=distance(a,b);
    // Discontinuities, weak fixes and impossible jumps never add distance.
    if(dt<=0||dt>30||a.accuracy>35||b.accuracy>35||d/dt>70||b.sequence!==a.sequence+1) {gaps++;continue;}
    if(d>=Math.max(3, Math.min(a.accuracy,b.accuracy)*0.5)) metres+=d;
    validSegments++;
  }
  return {distanceMetres:Math.round(metres),samples:samples.length,validSegments,gaps,method:'haversine-v1; max-gap=30s; max-accuracy=35m; max-speed=70m/s',source:'accepted_device_samples'};
}
