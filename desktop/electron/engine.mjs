import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {request} from './throne-api.mjs';
import {jsonProfiles,fullXraySubscription,preferredSubscription} from './subscription.mjs';
import {prepareNativeApi} from './native-settings.mjs';
import {profileDetails} from './profile-details.mjs';
import {installGeoAssets} from './geo-assets.mjs';

export const RUSSIA_ROUTE = {
  name:'Mini Throne · Bypass Russia · Offline',kind:'raw',default_outbound:-1,prevent_modifications:false
};
export async function freePort() {
  return new Promise((resolve,reject)=>{
    const server=net.createServer();server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});
  });
}
export class Engine {
  constructor({runtime,data,guard,onExit,ruleDirectory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../assets/rules')}) {Object.assign(this,{runtime,data,guard,onExit,ruleDirectory});this.connection=null;this.child=null;this.proxy=null;}
  async start({native=false}={}) {
    if(this.child&&this.child.exitCode===null)throw new Error('engine_already_running');
    this.native=native;
    await fs.mkdir(this.data,{recursive:true});
    await installGeoAssets(path.resolve(this.ruleDirectory,'../geo'),this.data);
    this.detailCache=new Map();
    await promisify(execFile)(this.guard,['--recover',path.join(this.data,'proxy-backup.json')],{windowsHide:true,timeout:5000});
    const manifest=JSON.parse(await fs.readFile(path.join(this.ruleDirectory,'manifest.json'),'utf8'));
    for(const name of ['geoip-ru.srs','geosite-category-ru.srs']){
      const bytes=await fs.readFile(path.join(this.ruleDirectory,name));
      if(createHash('sha256').update(bytes).digest('hex')!==manifest.files[name].sha256)throw new Error('routing_integrity_failed');
    }
    const routeConfig={...RUSSIA_ROUTE,raw_route:JSON.stringify({
      rules:[{ip_is_private:true,action:'route',outbound:-2},{domain_suffix:['ru','su','xn--p1ai'],action:'route',outbound:-2},{rule_set:['geoip-ru','geosite-category-ru'],action:'route',outbound:-2}],
      rule_set:['geoip-ru','geosite-category-ru'].map(tag=>({type:'local',tag,format:'binary',path:path.join(this.ruleDirectory,`${tag}.srs`)})),final:-1
    })};
    const port=await freePort();
    const keyPath=path.join(this.data,'config/api.key');
    await fs.mkdir(path.dirname(keyPath),{recursive:true});
    try{await fs.writeFile(keyPath,randomBytes(32).toString('base64url'),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
    const key=Buffer.from((await fs.readFile(keyPath,'utf8')).trim(),'base64url');
    if(key.length!==32)throw new Error('invalid_engine_key');
    if(native)prepareNativeApi(this.data,port,key);
    const args=native?['-appdata',this.data]:['--headless','--no-resume','--data-dir',this.data,'--api-listen',`127.0.0.1:${port}`,'--api-key-file',keyPath];
    this.child=spawn(path.join(this.runtime,'Throne.exe'),args,{cwd:this.runtime,windowsHide:!native,stdio:'ignore'});
    if(!native)this.watcher=spawn(this.guard,['--watch',String(process.pid),String(this.child.pid)],{windowsHide:true,stdio:'ignore'});
    let startError;
    this.child.once('error',error=>{startError=error;});
    if(!native)this.watcher.once('error',error=>{startError=error;this.child.kill();});
    this.child.once('exit',()=>{this.connection=null;void this.disableProxy();this.onExit?.({native});});
    for(let attempt=0;attempt<100;attempt++) {
      if(startError)throw startError;
      if(this.child.exitCode!==null)throw new Error('engine_start_failed');
      try {
        const connection={port,key};
        const status=await request(connection,'GET','/v1/status',undefined,undefined,1000);
        if(status.core||native) {this.connection=connection;break;}
      } catch {}
      await delay(200);
    }
    if(!this.connection)throw new Error('engine_start_failed');
    if(native)return this.status();
    const marker=path.join(this.data,'mini-defaults.json');
    let initialized=false;try{initialized=JSON.parse(await fs.readFile(marker,'utf8')).version===1;}catch{}
    // Avoid collisions with other clients, including Throne's default DNS/API ports.
    if(!initialized){
      const ports=new Set();while(ports.size<3)ports.add(await freePort());
      const [inbound,dns,api]=[...ports];
      await this.call('PUT','/v1/settings',{settings:{inbound_enabled:true,inbound_address:'127.0.0.1',inbound_port:inbound,dns_in_port:dns,clash_api_port:0,singbox_api_port:api,sub_auto_update:60,sub_respect_server_interval:true,log_level:'warn',remember_enable:false}});
    }
    // The upstream HTTP probe can be filtered by full service JSON routes.
    // Migrate only the upstream default; retain custom tests from Throne.
    const currentSettings=(await this.call('GET','/v1/settings')).settings;
    if(currentSettings.test_url==='http://cp.cloudflare.com/'){
      await this.call('PUT','/v1/settings',{settings:{test_url:'https://www.gstatic.com/generate_204',...(currentSettings.test_timeout_ms===3000?{test_timeout_ms:5000}:{})}});
    }
    await this.call('PUT','/v1/modes',{tun:false});
    const {routes}=await this.call('GET','/v1/routes');
    const found=routes.find(route=>route.name===RUSSIA_ROUTE.name);
    const route=found||(!initialized?(await this.call('POST','/v1/routes',routeConfig)).route:null);
    this.routeId=route?.id??null;
    if(!initialized){await this.call('PUT','/v1/routes/active',{id:route.id});await fs.writeFile(marker,JSON.stringify({version:1}));}
    return this.status();
  }
  call(method,path,body,query) {if(!this.connection)throw new Error('engine_unavailable');if(method!=='GET'&&/^\/v1\/(groups|profiles|import)/.test(path))this.detailCache?.clear();return request(this.connection,method,path,body,query);}
  status(){return this.call('GET','/v1/status');}
  setTun(enabled){return this.call('PUT','/v1/modes',{tun:enabled,timeout:60});}
  async profiles(group) {
    const {profiles}=await this.call('GET','/v1/profiles',undefined,{group:String(group)});
    // A bounded number of local encrypted API calls; latency polling reuses labels.
    for(let offset=0;offset<profiles.length;offset+=4)await Promise.all(profiles.slice(offset,offset+4).map(async profile=>{
      if(!this.detailCache.has(profile.id)){
        const config=await this.call('GET',`/v1/profiles/${profile.id}/config`);
        this.detailCache.set(profile.id,profileDetails(profile.type,config.outbound));
      }
      profile.details=this.detailCache.get(profile.id);
    }));
    return profiles;
  }
  async testLatency(ids,onProgress){
    if(this.testJob)throw new Error('test_busy');
    const job=await this.call('POST','/v1/tests',{kind:'latency',profiles:ids,wait:false});
    this.testJob=job.id;
    try{
      const deadline=Date.now()+120000;
      while(Date.now()<deadline){
        const current=await this.call('GET',`/v1/tests/${job.id}`);
        await onProgress?.(current);
        if(current.state!=='running')return current;
        await delay(1000);
      }
      await this.cancelTest();throw new Error('test_timeout');
    }finally{this.testJob=null;}
  }
  async cancelTest(){if(this.testJob)await this.call('DELETE',`/v1/tests/${this.testJob}`);}
  async addSource({kind,name,text}) {
    if(!['subscription','servers','json'].includes(kind)||typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>2097152||typeof name!=='string'||name.length>80)throw new Error('invalid_import');
    text=text.trim();name=name.trim();
    if(kind==='subscription'){
      const url=new URL(text);
      if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.hash||/\s/.test(text))throw new Error('invalid_subscription');
      return this.replaceSubscription({name:name||url.hostname,url:url.href});
    }
    if(kind==='json')text=jsonProfiles(text);
    const links=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    if(kind!=='json'&&(links.length>200||links.some(link=>!/^[-a-z0-9+]+:\/\//i.test(link)||/^(file|javascript|data):/i.test(link))))throw new Error('invalid_import');
    const routeId=kind==='json'&&fullXraySubscription(JSON.parse(text))?await this.subscriptionRouting():-1;
    const {group}=await this.call('POST','/v1/groups',{name:name||'Servers',route_id:routeId});
    try{
      const result=await this.call('POST','/v1/import',{as:'profiles',text:kind==='json'?text:links.join('\n'),group:group.id,timeout:60});
      if(!result.imported||result.failed)throw new Error('invalid_import');
      return group.id;
    }catch(error){await this.call('DELETE',`/v1/groups/${group.id}`).catch(()=>{});throw error;}
  }
  async replaceSubscription({name,url},oldGroup) {
    const preferred=await preferredSubscription(url);url=preferred.url;
    const routeId=preferred.fullXray?await this.subscriptionRouting():-1;
    const result=await this.call('POST','/v1/groups',{name,url,auto_update:true,update:true,route_id:routeId,import_route:false,timeout:60});
    const id=result.group.id;
    if(result.update?.ok===false || !(await this.profiles(id)).length) {
      await this.call('DELETE',`/v1/groups/${id}`).catch(()=>{});
      throw new Error('subscription_update_failed');
    }
    if(Number.isInteger(oldGroup)&&oldGroup!==id)await this.call('DELETE',`/v1/groups/${oldGroup}`);
    return id;
  }
  async subscriptionRouting(){
    const name='Mini Throne · Subscription routing';
    const {routes}=await this.call('GET','/v1/routes');
    const route=routes.find(r=>r.name===name)||(await this.call('POST','/v1/routes',{name,kind:'raw',raw_route:JSON.stringify({rules:[],final:-1}),default_outbound:-1,prevent_modifications:false})).route;
    return route.id;
  }
  async connect(id,systemProxy=true,tun=false) {
    const before=await this.status();
    if(before.tun!==tun)await this.setTun(tun);
    let status,waitingForGeo=false;
    try{status=await this.call('PUT','/v1/connection',{profile:id,timeout:60});}
    catch(error){
      // Headless Throne downloads missing geodata and retries the same profile.
      // Its initial API response arrives before that asynchronous retry finishes.
      if(error.code!=='geo_assets_missing')throw error;
      waitingForGeo=true;status=await this.status();
    }
    for(let attempt=0;(status.state==='connecting'||waitingForGeo&&status.state!=='running')&&attempt<60;attempt++){await delay(1000);status=await this.status();}
    if(status.state!=='running'||status.profile?.id!==id){await this.call('DELETE','/v1/connection').catch(()=>{});throw new Error('connection_pending');}
    if(systemProxy&&!tun) {
      try {await this.enableProxy(status.inbound.port);}catch(error){await this.call('DELETE','/v1/connection').catch(()=>{});throw error;}
    }
    return status;
  }
  async enableProxy(port) {
    await this.disableProxy();
    const child=spawn(this.guard,[String(process.pid),String(this.child.pid),String(port),path.join(this.data,'proxy-backup.json')],{windowsHide:true,stdio:['pipe','pipe','ignore']});
    this.proxy=child;
    await new Promise((resolve,reject)=>{
      let settled=false,output='';
      const done=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve();};
      const timer=setTimeout(()=>done(new Error('proxy_setup_failed')),10000);
      child.once('error',()=>{if(this.proxy===child)this.proxy=null;done(new Error('proxy_setup_failed'));});
      child.once('exit',code=>{if(this.proxy===child)this.proxy=null;done(new Error(`proxy_setup_failed_${code}`));});
      child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('READY'))done();});
    });
  }
  async disableProxy() {
    const child=this.proxy;if(!child)return;
    this.proxy=null;
    if(child.exitCode!==null)return;
    await new Promise(resolve=>{child.once('exit',resolve);child.stdin.end();});
  }
  async disconnect(){await this.disableProxy();return this.call('DELETE','/v1/connection',{timeout:30});}
  async shutdown(){
    await this.disableProxy();
    const child=this.child;if(!child||child.exitCode!==null)return;
    if(this.connection){try{await this.call('POST','/v1/shutdown',{});}catch(error){if(this.native)throw error;child.kill();}}
    else if(this.native)throw new Error('native_window_open');else child.kill();
    if(child.exitCode===null)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.off('exit',done);reject(new Error('native_window_open'));},15000);const done=()=>{clearTimeout(timer);resolve();};child.once('exit',done);});
  }
}
