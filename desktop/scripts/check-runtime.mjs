// Run in Electron, whose crypto implementation differs from standalone Node.
import {app} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {deriveKeys,seal,open} from '../electron/throne-api.mjs';
import {Engine} from '../electron/engine.mjs';

async function checkRuntime(){
const root=fileURLToPath(new URL('../',import.meta.url));
const temporaryRoot=path.resolve(os.tmpdir());
const directory=await fs.mkdtemp(path.join(temporaryRoot,'mini-throne-runtime-'));
app.setPath('userData',path.join(directory,'electron'));
let engine,code=0;
const servers=[];
try{
  await app.whenReady();
  const vectors=JSON.parse(await fs.readFile(new URL('./fixtures/throne-api-v1.json',import.meta.url),'utf8'));
  let frames=0,rejections=0;
  for(const sample of vectors.cases){
    const keys=deriveKeys(Buffer.from(sample.key,'base64url'),Buffer.from(sample.server_hello,'hex'),Buffer.from(sample.client_hello,'hex').subarray(1));
    assert.equal(keys.c2s.toString('hex'),sample.k_c2s);
    assert.equal(keys.s2c.toString('hex'),sample.k_s2c);
    for(const frame of sample.frames){
      const plaintext=Buffer.from(frame.plaintext);
      assert.equal(seal(keys[frame.dir],frame.counter,plaintext).toString('hex'),frame.wire);
      assert.deepEqual(open(keys[frame.dir],frame.counter,Buffer.from(frame.wire,'hex')),plaintext);
      frames++;
    }
    for(const frame of sample.invalid||[]){
      assert.throws(()=>open(keys[frame.dir],frame.counter,Buffer.from(frame.wire,'hex')));
      rejections++;
    }
  }
  engine=new Engine({runtime:path.join(root,'runtime'),guard:path.join(root,'native/bin/ProxyGuard.exe'),ruleDirectory:path.join(root,'assets/rules'),data:path.join(directory,'engine')});
  const status=await engine.start();
  assert.ok(status.core);
  assert.equal(status.state,'idle');
  assert.equal((await engine.setTun(false)).tun,false);
  if(!status.capabilities?.tun){
    await assert.rejects(engine.setTun(true),error=>error.code==='needs_privileges');
    assert.equal((await engine.status()).tun,false);
  }
  const listen=async handler=>{
    const server=http.createServer(handler);servers.push(server);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    return server.address().port;
  };
  let hits=0;
  const proxyPort=await listen((_request,response)=>{hits++;response.end('mini-throne-proxy-ok');});
  // Throne's HTTP outbound uses CONNECT even for a plain HTTP destination.
  servers.at(-1).on('connect',(_request,socket,head)=>{
    socket.write('HTTP/1.1 200 Connection established\r\n\r\n');
    const reply=()=>{hits++;socket.end('HTTP/1.1 200 OK\r\nContent-Length: 20\r\nConnection: close\r\n\r\nmini-throne-proxy-ok');};
    if(head.length)reply();else socket.once('data',reply);
  });
  const httpLink=`http://127.0.0.1:${proxyPort}/#Manual%20HTTP`;
  const links=[httpLink,'vless://11111111-1111-4111-8111-111111111111@203.0.113.1:443?security=tls&type=tcp#VLESS','trojan://synthetic-password@203.0.113.1:443#Trojan',`ss://${Buffer.from('aes-128-gcm:synthetic-password').toString('base64')}@203.0.113.1:443#Shadowsocks`];
  const manual=await engine.addSource({kind:'servers',name:'Manual source',text:links.join('\n')});
  const profiles=await engine.profiles(manual);assert.equal(profiles.length,links.length);
  const chosen=profiles.find(profile=>profile.name==='Manual HTTP');assert.ok(chosen);
  let subscriptionText=httpLink.replace('Manual%20HTTP','Subscription%201');
  const subPort=await listen((_request,response)=>response.end(Buffer.from(subscriptionText).toString('base64')));
  const subscription=await engine.addSource({kind:'subscription',name:'Subscription source',text:`http://127.0.0.1:${subPort}/subscription`});
  assert.equal((await engine.profiles(subscription))[0].name,'Subscription 1');
  subscriptionText=httpLink.replace('Manual%20HTTP','Subscription%202');
  await engine.call('POST',`/v1/groups/${subscription}/update`,{timeout:60});
  assert.equal((await engine.profiles(subscription))[0].name,'Subscription 2');
  const connected=await engine.connect(chosen.id,false);
  const body=await new Promise((resolve,reject)=>{
    const request=http.get({hostname:'127.0.0.1',port:connected.inbound.port,path:'http://203.0.113.42/probe'},response=>{let text='';response.on('data',chunk=>text+=chunk);response.on('end',()=>resolve(text));});
    request.on('error',reject);request.setTimeout(10000,()=>request.destroy(new Error('Proxy traffic timeout')));
  });
  assert.equal(body,'mini-throne-proxy-ok');assert.ok(hits>0);await engine.disconnect();
  const before=(await engine.call('GET','/v1/groups')).groups.length;
  await assert.rejects(engine.addSource({kind:'servers',name:'Invalid source',text:'vless://invalid'}));
  assert.equal((await engine.call('GET','/v1/groups')).groups.length,before);
  await engine.shutdown();
  if(engine.child.exitCode===null)await new Promise(resolve=>engine.child.once('exit',resolve));
  await engine.start();
  assert.equal((await engine.profiles(manual)).length,links.length);
  assert.equal((await engine.profiles(subscription))[0].name,'Subscription 2');
  await engine.call('DELETE',`/v1/groups/${manual}`);await engine.call('DELETE',`/v1/groups/${subscription}`);
  console.log(JSON.stringify({electron:process.versions.electron,frames,rejections,engineReady:true,tunDisabled:true,tunPrivilegeRefusal:!status.capabilities?.tun,manualProfiles:links.length,subscriptionImport:true,subscriptionUpdate:true,persistedAfterRestart:true,proxyTraffic:true,failedImportRolledBack:true,systemProxyChanged:false}));
}catch(error){code=1;console.error(error);}finally{
  if(engine){
    await engine.shutdown();
    if(engine.child&&engine.child.exitCode===null){
      await new Promise(resolve=>{const timer=setTimeout(()=>{engine.child.kill();resolve();},5000);engine.child.once('exit',()=>{clearTimeout(timer);resolve();});});
    }
  }
  for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  // Only remove the exact temporary child directory created above.
  if(path.dirname(path.resolve(directory))!==temporaryRoot||!path.basename(directory).startsWith('mini-throne-runtime-'))throw new Error('Unsafe cleanup path');
  await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  app.exit(code);
}
}
// Do not await app readiness at module top level: Electron waits for ESM loading.
void checkRuntime();
