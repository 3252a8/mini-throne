import {download} from './http.mjs';

export function jsonProfiles(text){
  let value;try{value=JSON.parse(text);}catch{throw new Error('invalid_json');}
  // Throne preserves an array of complete Xray configs, including routing and
  // balancers. A standalone object would otherwise be flattened to outbounds.
  if(value&& !Array.isArray(value)&&Array.isArray(value.outbounds)&&value.outbounds.some(o=>o?.protocol))value=[value];
  if(!value||typeof value!=='object'||Array.isArray(value)&&(!value.length||value.length>200))throw new Error('invalid_json');
  return JSON.stringify(value);
}
export function fullXraySubscription(value){
  return Array.isArray(value)&&value.length>0&&value.length<=200&&value.every(c=>c&&Array.isArray(c.outbounds)&&c.outbounds.some(o=>typeof o?.protocol==='string'));
}
export async function preferredSubscription(value,fetcher=download){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.hash||/\/(singbox|clash|mihomo)\/?$/i.test(url.pathname))return {url:value,fullXray:false};
  // Probe only the same origin. Generic subscription servers retain their URL
  // unless the JSON endpoint actually supplies complete Xray configurations.
  const candidate=new URL(url);if(!/\/json\/?$/i.test(candidate.pathname))candidate.pathname=candidate.pathname.replace(/\/$/,'')+'/json';
  try{
    const response=await fetcher(candidate,{maxBytes:4*1024*1024,timeoutMs:8000});
    if(response.status===200&&fullXraySubscription(JSON.parse(response.bytes.toString('utf8'))))return {url:candidate.href,fullXray:true};
  }catch{}
  return {url:value,fullXray:false};
}
