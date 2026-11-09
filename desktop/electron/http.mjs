import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns';
import net from 'node:net';

const blocked=new net.BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]])blocked.addSubnet(address,prefix,'ipv4');
for(const [address,prefix] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8]])blocked.addSubnet(address,prefix,'ipv6');
export function publicAddress(address,family) {
  if(address.toLowerCase().startsWith('::ffff:'))return false;
  return !blocked.check(address,family===6?'ipv6':'ipv4');
}
export function download(url,{method='GET',body,token,maxBytes=1048576,allowLocal=false,timeoutMs=20000}={}) {
  const target=new URL(url);
  if(target.username||target.password||target.hash||target.protocol!=='https:'&&!(allowLocal&&target.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(target.hostname)))throw new Error('unsafe_url');
  return new Promise((resolve,reject)=>{
    const payload=body===undefined?null:Buffer.from(JSON.stringify(body));
    const headers={'User-Agent':'Mini-Throne/0.1','Accept':'application/json'};
    if(payload){headers['Content-Type']='application/json';headers['Content-Length']=String(payload.length);}
    if(token)headers.Authorization=`Bearer ${token}`;
    const request=(target.protocol==='https:'?https:http).request(target,{method,headers,lookup(host,options,callback){
      dns.lookup(host,{all:true},(error,records)=>{
        if(error)return callback(error);
        if(!records.length||!allowLocal&&records.some(r=>!publicAddress(r.address,r.family)))return callback(new Error('unsafe_address'));
        if(options.all)callback(null,records);else callback(null,records[0].address,records[0].family);
      });
    }},response=>{
      const chunks=[];let size=0;
      response.on('data',chunk=>{size+=chunk.length;if(size>maxBytes)request.destroy(new Error('response_too_large'));else chunks.push(chunk);});
      response.on('error',reject);
      response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,bytes:Buffer.concat(chunks)}));
    });
    const timer=setTimeout(()=>request.destroy(new Error('network_timeout')),timeoutMs);
    request.on('close',()=>clearTimeout(timer));request.on('error',reject);
    request.end(payload);
  });
}
export async function api(origin,path,options={}) {
  if(!path.startsWith('/api/plugins/mini-throne/v1/'))throw new Error('invalid_endpoint');
  const result=await download(new URL(path,origin),options);
  let data;try{data=JSON.parse(result.bytes.toString('utf8'));}catch{throw new Error('invalid_service_response');}
  if(result.status<200||result.status>=300||data.ok!==true){const error=new Error(data.error?.code||'service_error');error.status=result.status;throw error;}
  return {status:result.status,data};
}
