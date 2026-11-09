import {app,BrowserWindow,ipcMain,safeStorage,shell,nativeImage,Tray,Menu} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Engine} from './engine.mjs';
import {Account} from './account.mjs';
import {download,api} from './http.mjs';
import {parseDeepLink} from './urls.mjs';
import {consumeEnrollment} from './enrollment.mjs';
import {updates} from './updates.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const demo=!app.isPackaged&&process.argv.includes('--demo');
const customData=!app.isPackaged?process.argv.find(arg=>arg.startsWith('--data-dir='))?.slice(11):null;
app.setPath('userData',customData||path.join(app.getPath('appData'),'Mini Throne'));
if(!app.requestSingleInstanceLock()){app.quit();}else{
  let window,tray,engine,account,updater,quitting=false,queue=Promise.resolve(),polling=false;
  const directory=app.getPath('userData');
  let privateConfig={systemProxy:true,autoLaunch:false,language:app.getLocale().startsWith('ru')?'ru':'en',group:null,subscriptionHash:null};
  let state={version:app.getVersion(),ready:false,connected:false,busy:false,profiles:[],selected:null,branding:null,origin:null,expiresAt:null,active:false,login:null,error:null,update:{status:'unconfigured'},settings:privateConfig,demo};
  function publish(){state.settings={systemProxy:privateConfig.systemProxy,autoLaunch:privateConfig.autoLaunch,language:privateConfig.language};if(window&&!window.isDestroyed())window.webContents.send('mini:state',state);}
  async function saveConfig(){await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'settings.json'),JSON.stringify(privateConfig),{mode:0o600});}
  function operation(action){const next=queue.then(async()=>{state.busy=true;state.error=null;publish();try{return await action();}catch(error){state.error=String(error.message||'operation_failed').replace(/[^a-z0-9_]/gi,'').slice(0,80)||'operation_failed';return false;}finally{state.busy=false;publish();}});queue=next.catch(()=>{});return next;}
  async function logo(origin,value){
    if(!value)return null;
    try{
      const url=new URL(value,origin);if(url.origin!==origin)return null;
      const result=await download(url,{maxBytes:524288});
      if(result.status!==200)return null;
      const png=result.bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const jpeg=result.bytes[0]===255&&result.bytes[1]===216;
      const webp=result.bytes.subarray(0,4).toString()==='RIFF'&&result.bytes.subarray(8,12).toString()==='WEBP';
      if(!png&&!jpeg&&!webp)return null;
      const decoded=nativeImage.createFromBuffer(result.bytes);if(decoded.isEmpty())return null;
      return decoded.resize({width:96,height:96,quality:'good'}).toDataURL();
    }catch{return null;}
  }
  async function refresh(){
    if(!account.value)return;
    state.origin=account.value.origin;
    let data;
    try{data=await account.authorized('/bootstrap');}
    catch(error){
      if(error.status===401||error.status===403){
        await engine.disconnect();await account.forget();
        if(Number.isInteger(privateConfig.group))await engine.call('DELETE',`/v1/groups/${privateConfig.group}`).catch(()=>{});
        privateConfig.group=null;privateConfig.subscriptionHash=null;await saveConfig();
        Object.assign(state,{connected:false,active:false,profiles:[],origin:null,branding:null,selected:null});
      }
      throw error;
    }
    let resume=false;
    const previousName=state.profiles.find(profile=>profile.id===state.selected)?.name;
    if(data.protocol!==1)throw new Error('unsupported_service');
    const brand=data.branding||{};
    state.branding={name:String(brand.name||'Minishop').slice(0,80),accent:/^#[a-f0-9]{6}$/i.test(brand.accent)?brand.accent:'#55ded4',logo:await logo(account.value.origin,brand.logo_url)};
    state.origin=account.value.origin;state.expiresAt=data.subscription?.expires_at||null;state.active=data.subscription?.active===true;
    if(!state.active){await engine.disconnect();state.connected=false;state.profiles=[];return;}
    const url=new URL(data.subscription.url);if(url.protocol!=='https:'||url.username||url.password)throw new Error('unsafe_subscription');
    const {createHash}=await import('node:crypto');const hash=createHash('sha256').update(url.href).digest('hex');
    if(hash!==privateConfig.subscriptionHash||!Number.isInteger(privateConfig.group)){
      if(state.connected){resume=true;await engine.disconnect();state.connected=false;}
      privateConfig.group=await engine.replaceSubscription({name:state.branding.name,url:url.href},privateConfig.group);
      privateConfig.subscriptionHash=hash;await saveConfig();
    }else await engine.call('POST',`/v1/groups/${privateConfig.group}/update`,{timeout:60});
    const profiles=await engine.profiles(privateConfig.group);
    state.profiles=profiles.map(({id,name,country,latency_ms,type})=>({id,name,country,latency:latency_ms,type}));
    if(!state.profiles.some(p=>p.id===state.selected))state.selected=state.profiles.find(p=>p.name===previousName)?.id??state.profiles[0]?.id??null;
    if(resume&&state.selected!==null){await engine.connect(state.selected,privateConfig.systemProxy);state.connected=true;}
  }
  function link(value){try{state.suggestedOrigin=parseDeepLink(value);window?.show();window?.focus();publish();}catch{state.error='invalid_link';publish();}}
  app.on('second-instance',(_event,args)=>{const url=args.find(arg=>arg.startsWith('mini-throne:'));if(url)link(url);else{window?.show();window?.focus();}});
  app.on('open-url',(event,url)=>{event.preventDefault();link(url);});
  function handle(channel,callback){ipcMain.handle(channel,(event,...args)=>{if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('untrusted_sender');return callback(...args);});}
  async function shutdown(){await engine?.shutdown();}
  app.on('before-quit',event=>{if(quitting)return;event.preventDefault();quitting=true;void shutdown().finally(()=>app.quit());});
  app.on('window-all-closed',()=>{});
  app.whenReady().then(async()=>{
    await fs.mkdir(directory,{recursive:true});
    try{const stored=JSON.parse(await fs.readFile(path.join(directory,'settings.json'),'utf8'));privateConfig={...privateConfig,...stored};}catch{}
    window=new BrowserWindow({width:460,height:790,minWidth:390,minHeight:650,show:false,title:'Mini Throne',backgroundColor:'#071f26',autoHideMenuBar:true,webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',event=>event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    window.on('close',event=>{if(!quitting&&tray){event.preventDefault();window.hide();}});
    const icon=nativeImage.createFromPath(app.isPackaged?path.join(process.resourcesPath,'icon.png'):path.join(here,'../assets/icon.png'));
    if(!icon.isEmpty()){tray=new Tray(icon);tray.setToolTip('Mini Throne');tray.setContextMenu(Menu.buildFromTemplate([{label:'Mini Throne',click:()=>window.show()},{label:privateConfig.language==='ru'?'Выход':'Quit',click:()=>app.quit()}]));tray.on('click',()=>window.show());}
    account=new Account({directory,safeStorage,openBrowser:url=>shell.openExternal(url),onLogin:value=>{state.login=value;publish();}});
    await account.load();
    handle('mini:state',()=>{publish();return state;});
    handle('mini:login',raw=>{if(typeof raw!=='string'||raw.length>2048)return false;return operation(async()=>{if(account.value)throw new Error('logout_first');if(await account.login(raw))await refresh();});});
    handle('mini:cancel-login',()=>{account.cancel();state.login=null;publish();});
    handle('mini:connect',id=>operation(async()=>{if(!state.profiles.some(p=>p.id===id)||!state.active)throw new Error('invalid_profile');state.selected=id;await engine.connect(id,privateConfig.systemProxy);state.connected=true;}));
    handle('mini:disconnect',()=>operation(async()=>{await engine.disconnect();state.connected=false;}));
    handle('mini:refresh',()=>operation(refresh));
    handle('mini:logout',()=>operation(async()=>{await engine.disconnect();const revoked=await account.logout();if(Number.isInteger(privateConfig.group))await engine.call('DELETE',`/v1/groups/${privateConfig.group}`);privateConfig.group=null;privateConfig.subscriptionHash=null;await saveConfig();Object.assign(state,{connected:false,profiles:[],branding:null,origin:null,active:false,selected:null,login:null,error:revoked?null:'offline_logout'});}));
    handle('mini:settings',values=>operation(async()=>{
      if(!values||typeof values!=='object')throw new Error('invalid_settings');
      if(typeof values.systemProxy==='boolean'){privateConfig.systemProxy=values.systemProxy;if(state.connected){if(values.systemProxy)await engine.enableProxy((await engine.status()).inbound.port);else await engine.disableProxy();}}
      if(typeof values.autoLaunch==='boolean'){privateConfig.autoLaunch=values.autoLaunch;app.setLoginItemSettings({openAtLogin:values.autoLaunch});}
      if(['ru','en'].includes(values.language))privateConfig.language=values.language;
      await saveConfig();
    }));
    handle('mini:update',()=>operation(()=>state.update.status==='ready'?updater.install():updater.check()));
    await window.loadFile(path.join(here,'../dist/index.html'));if(!process.argv.includes('--hidden'))window.show();
    if(app.isPackaged)app.setAsDefaultProtocolClient('mini-throne');
    if(demo){Object.assign(state,{ready:true,active:true,branding:{name:'Northline',accent:'#55ded4',logo:null},origin:'https://vpn.example.com',expiresAt:'2026-12-09T00:00:00Z',profiles:[{id:1,name:'Нидерланды',country:'NL',latency:42,type:'vless'},{id:2,name:'Германия',country:'DE',latency:57,type:'vless'},{id:3,name:'Швеция',country:'SE',latency:68,type:'vless'},{id:4,name:'Финляндия',country:'FI',latency:76,type:'vless'}],selected:1});publish();return;}
    engine=new Engine({ruleDirectory:app.isPackaged?path.join(process.resourcesPath,'rules'):path.join(here,'../assets/rules'),runtime:app.isPackaged?path.join(process.resourcesPath,'engine'):path.join(here,'../runtime'),data:path.join(directory,'engine'),guard:app.isPackaged?path.join(process.resourcesPath,'ProxyGuard.exe'):path.join(here,'../native/bin/ProxyGuard.exe'),onExit:()=>{state.connected=false;if(!quitting)state.error='engine_stopped';publish();}});
    await operation(async()=>{
      await engine.start();state.ready=true;
      try{await consumeEnrollment({directory,account,request:api});}
      catch{state.error='enrollment_failed';}
      if(account.value)await refresh();
    });
    updater=await updates({app,onState:value=>{state.update=value;publish();},beforeInstall:async()=>{quitting=true;await shutdown();},isConnected:()=>state.connected||state.busy});
    const initialLink=process.argv.find(arg=>arg.startsWith('mini-throne:'));if(initialLink)link(initialLink);
    setInterval(async()=>{if(polling||state.busy||!state.ready||quitting)return;polling=true;try{const status=await engine.status();state.connected=status.state==='running';if(!state.connected)await engine.disableProxy();if(status.profile)state.selected=status.profile.id;publish();}catch{state.connected=false;state.error='engine_unavailable';publish();}finally{polling=false;}},2500).unref();
    setInterval(()=>{if(account.value&&!state.busy)void operation(refresh);},3600000).unref();
  }).catch(()=>{state.error='startup_failed';publish();});
}
