import {app,BrowserWindow,ipcMain,safeStorage,shell,nativeImage,Tray,Menu} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Engine} from './engine.mjs';
import {readNativeModes} from './native-settings.mjs';
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
  let window,tray,engine,account,updater,quitting=false,queue=Promise.resolve(),polling=false,nativeTransition=false,nativeInitial=null;
  const directory=app.getPath('userData');
  let privateConfig={systemProxy:true,tun:false,autoLaunch:false,language:app.getLocale().startsWith('ru')?'ru':'en',group:null,subscriptionHash:null,manualGroups:[],sourceId:null,selectedProfile:null};
  let state={version:app.getVersion(),ready:false,connected:false,busy:false,tunAvailable:false,tunConflict:false,profiles:[],selected:null,sources:[],sourceId:null,branding:null,origin:null,expiresAt:null,active:false,login:null,error:null,update:{status:'unconfigured'},settings:privateConfig,demo,advanced:false,routeName:null};
  function publish(){state.settings={systemProxy:privateConfig.systemProxy,tun:privateConfig.tun,autoLaunch:privateConfig.autoLaunch,language:privateConfig.language};if(window&&!window.isDestroyed())window.webContents.send('mini:state',state);}
  function capabilities(status){state.tunAvailable=status.capabilities?.tun===true;state.tunConflict=!!status.tun_conflict;if(status.state==='running')state.routeName=status.route?.name||null;}
  async function saveConfig(){await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'settings.json'),JSON.stringify(privateConfig),{mode:0o600});}
  function operation(action,{native=false}={}){const next=queue.then(async()=>{if(state.advanced&&!native){state.error='native_window_open';publish();return false;}state.busy=true;state.error=null;publish();try{return await action();}catch(error){state.error=String(error.message||'operation_failed').replace(/[^a-z0-9_]/gi,'').slice(0,80)||'operation_failed';return false;}finally{state.busy=false;publish();}});queue=next.catch(()=>{});return next;}
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
  async function syncSources({adoptNative=false}={}){
    const {groups}=await engine.call('GET','/v1/groups');
    const ids=adoptNative?groups.filter(group=>group.profile_count>0).map(group=>group.id):Array.isArray(privateConfig.manualGroups)?privateConfig.manualGroups:[];
    if(Number.isInteger(privateConfig.group)&&!groups.some(group=>group.id===privateConfig.group)){privateConfig.group=null;privateConfig.subscriptionHash=null;}
    const manual=groups.filter(group=>ids.includes(group.id)&&group.id!==privateConfig.group&&!group.archived);
    privateConfig.manualGroups=manual.map(group=>group.id);
    state.sources=manual.map(group=>({id:group.id,name:group.name,subscription:group.subscription,count:group.profile_count,service:false}));
    if(account.value)state.sources.unshift({id:-1,name:state.branding?.name||'Minishop',subscription:true,count:0,service:true});
    if(!state.sources.some(source=>source.id===privateConfig.sourceId))privateConfig.sourceId=state.sources[0]?.id??null;
    state.sourceId=privateConfig.sourceId;
    const {routes}=await engine.call('GET','/v1/routes');
    const group=groups.find(item=>item.id===(state.sourceId===-1?privateConfig.group:state.sourceId));
    state.routeName=(group&&group.route_id>=0?routes.find(route=>route.id===group.route_id):routes.find(route=>route.active))?.name||null;
    await saveConfig();
  }
  async function loadManual(){
    if(state.sourceId===-1)return;
    const profiles=state.sourceId===null?[]:await engine.profiles(state.sourceId);
    state.profiles=profiles.map(({id,name,country,latency_ms,type})=>({id,name,country:country||'',latency:latency_ms,type}));
    state.active=profiles.length>0;
    if(!profiles.some(profile=>profile.id===state.selected))state.selected=profiles.find(profile=>profile.id===privateConfig.selectedProfile)?.id??profiles[0]?.id??null;
    privateConfig.selectedProfile=state.selected;await saveConfig();
  }
  function clearProfiles(){state.profiles=[];state.selected=null;state.active=false;}
  async function refresh(){
    try{
      if(state.sourceId!==null&&state.sourceId!==-1){
        if(state.sources.find(source=>source.id===state.sourceId)?.subscription)await engine.call('POST',`/v1/groups/${state.sourceId}/update`,{timeout:60});
      }else await refreshService();
    }finally{await syncSources();await loadManual();}
  }
  async function refreshService(){
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
    if(!state.profiles.some(p=>p.id===state.selected))state.selected=state.profiles.find(p=>p.id===privateConfig.selectedProfile)?.id??state.profiles.find(p=>p.name===previousName)?.id??state.profiles[0]?.id??null;
    privateConfig.selectedProfile=state.selected;await saveConfig();
    if(resume&&state.selected!==null){await engine.connect(state.selected,privateConfig.systemProxy,privateConfig.tun);state.connected=true;}
  }
  async function returnFromNative(){
    if(!state.advanced)return true;
    nativeTransition=true;
    try{
      const status=engine.child?.exitCode===null?await engine.status():readNativeModes(engine.data);
      {
        if(nativeInitial&&(status.tun!==nativeInitial.tun||status.system_proxy!==nativeInitial.system_proxy)){
          privateConfig.tun=status.tun===true;privateConfig.systemProxy=!privateConfig.tun&&status.system_proxy===true;await saveConfig();
        }
        if(engine.child?.exitCode===null)await engine.shutdown();
      }
      state.advanced=false;state.connected=false;
      capabilities(await engine.start());state.ready=true;
      await syncSources({adoptNative:true});
      if(state.sourceId===-1){const profiles=Number.isInteger(privateConfig.group)?await engine.profiles(privateConfig.group):[];state.profiles=profiles.map(({id,name,country,latency_ms,type})=>({id,name,country,latency:latency_ms,type}));state.active=profiles.length>0;state.selected=profiles.some(p=>p.id===state.selected)?state.selected:profiles[0]?.id??null;}
      else await loadManual();
      if(privateConfig.tun)capabilities(await engine.setTun(true));
      state.ready=true;state.error=null;return true;
    }finally{nativeTransition=false;}
  }
  function link(value){try{state.suggestedOrigin=parseDeepLink(value);window?.show();window?.focus();publish();}catch{state.error='invalid_link';publish();}}
  app.on('second-instance',(_event,args)=>{const url=args.find(arg=>arg.startsWith('mini-throne:'));if(url)link(url);else{window?.show();window?.focus();}});
  app.on('open-url',(event,url)=>{event.preventDefault();link(url);});
  function handle(channel,callback){ipcMain.handle(channel,(event,...args)=>{if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('untrusted_sender');return callback(...args);});}
  async function shutdown(){await engine?.shutdown();}
  app.on('before-quit',event=>{if(quitting)return;event.preventDefault();quitting=true;void shutdown().then(()=>app.quit()).catch(()=>{quitting=false;state.error='native_window_open';window?.show();publish();});});
  app.on('window-all-closed',()=>{});
  app.whenReady().then(async()=>{
    await fs.mkdir(directory,{recursive:true});
    try{const stored=JSON.parse(await fs.readFile(path.join(directory,'settings.json'),'utf8'));privateConfig={...privateConfig,...stored};}catch{}
    privateConfig.tun=privateConfig.tun===true;if(privateConfig.tun)privateConfig.systemProxy=false;
    window=new BrowserWindow({width:460,height:760,minWidth:390,minHeight:600,show:false,title:'Mini Throne',backgroundColor:'#191b1e',autoHideMenuBar:true,webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',event=>event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    window.on('close',event=>{if(!quitting&&tray){event.preventDefault();window.hide();}});
    const icon=nativeImage.createFromPath(app.isPackaged?path.join(process.resourcesPath,'icon.png'):path.join(here,'../assets/icon.png'));
    if(!icon.isEmpty()){tray=new Tray(icon);tray.setToolTip('Mini Throne');tray.setContextMenu(Menu.buildFromTemplate([{label:'Mini Throne',click:()=>window.show()},{label:privateConfig.language==='ru'?'Выход':'Quit',click:()=>app.quit()}]));tray.on('click',()=>window.show());}
    account=new Account({directory,safeStorage,openBrowser:url=>shell.openExternal(url),onLogin:value=>{state.login=value;publish();}});
    await account.load();
    state.origin=account.value?.origin||null;
    handle('mini:state',()=>{publish();return state;});
    handle('mini:login',raw=>{if(typeof raw!=='string'||raw.length>2048)return false;return operation(async()=>{if(account.value)throw new Error('logout_first');if(await account.login(raw)){await engine.disconnect();state.connected=false;clearProfiles();privateConfig.sourceId=-1;await syncSources();await refresh();}});});
    handle('mini:cancel-login',()=>{account.cancel();state.login=null;publish();});
    handle('mini:connect',id=>operation(async()=>{if(!state.profiles.some(p=>p.id===id)||!state.active)throw new Error('invalid_profile');state.selected=id;privateConfig.selectedProfile=id;await saveConfig();await engine.connect(id,privateConfig.systemProxy,privateConfig.tun);state.connected=true;}));
    handle('mini:select-profile',id=>operation(async()=>{if(!state.profiles.some(profile=>profile.id===id))throw new Error('invalid_profile');state.selected=id;privateConfig.selectedProfile=id;await saveConfig();if(state.connected)await engine.connect(id,privateConfig.systemProxy,privateConfig.tun);return true;}));
    handle('mini:disconnect',()=>operation(async()=>{await engine.disconnect();state.connected=false;}));
    handle('mini:refresh',()=>operation(refresh));
    handle('mini:add-source',input=>operation(async()=>{
      if(!input||typeof input!=='object')throw new Error('invalid_import');
      const id=await engine.addSource(input);
      privateConfig.manualGroups.push(id);await saveConfig();
      await engine.disconnect();state.connected=false;clearProfiles();privateConfig.sourceId=id;
      await syncSources();await loadManual();return true;
    }));
    handle('mini:select-source',id=>operation(async()=>{
      if(!state.sources.some(source=>source.id===id))throw new Error('invalid_source');
      await engine.disconnect();state.connected=false;clearProfiles();privateConfig.sourceId=id;
      await syncSources();if(id===-1)await refresh();else await loadManual();return true;
    }));
    handle('mini:remove-source',id=>operation(async()=>{
      if(!privateConfig.manualGroups.includes(id))throw new Error('invalid_source');
      if(state.sourceId===id){await engine.disconnect();state.connected=false;}
      await engine.call('DELETE',`/v1/groups/${id}`);
      if(state.sourceId===id)clearProfiles();
      privateConfig.manualGroups=privateConfig.manualGroups.filter(value=>value!==id);
      await syncSources();if(state.sourceId===-1)await refresh();else await loadManual();return true;
    }));
    handle('mini:logout',()=>operation(async()=>{await engine.disconnect();const revoked=await account.logout();if(Number.isInteger(privateConfig.group))await engine.call('DELETE',`/v1/groups/${privateConfig.group}`);privateConfig.group=null;privateConfig.subscriptionHash=null;await saveConfig();Object.assign(state,{connected:false,profiles:[],branding:null,origin:null,active:false,selected:null,login:null,error:revoked?null:'offline_logout'});await syncSources();await loadManual();}));
    handle('mini:settings',values=>operation(async()=>{
      if(!values||typeof values!=='object')throw new Error('invalid_settings');
      if(typeof values.systemProxy==='boolean'||typeof values.tun==='boolean'){
        if(values.systemProxy===true&&values.tun===true)throw new Error('invalid_settings');
        const tun=values.systemProxy===true?false:typeof values.tun==='boolean'?values.tun:privateConfig.tun;
        const systemProxy=tun?false:typeof values.systemProxy==='boolean'?values.systemProxy:privateConfig.systemProxy;
        const current=await engine.status();capabilities(current);
        if(tun&&!state.tunAvailable)throw new Error('needs_privileges');
        if(tun&&state.tunConflict)throw new Error('tun_conflict');
        if(tun!==privateConfig.tun||systemProxy!==privateConfig.systemProxy){
          const running=current.state==='running'?current.profile?.id:null;
          await engine.disconnect();state.connected=false;
          const applied=await engine.setTun(tun);capabilities(applied);
          privateConfig.tun=applied.tun===true;privateConfig.systemProxy=privateConfig.tun?false:systemProxy;
          await saveConfig();
          if(Number.isInteger(running)){await engine.connect(running,privateConfig.systemProxy,privateConfig.tun);state.connected=true;}
        }
      }
      if(typeof values.autoLaunch==='boolean'){privateConfig.autoLaunch=values.autoLaunch;app.setLoginItemSettings({openAtLogin:values.autoLaunch});}
      if(['ru','en'].includes(values.language))privateConfig.language=values.language;
      await saveConfig();
    }));
    handle('mini:update',()=>operation(()=>state.update.status==='ready'?updater.install():updater.check()));
    handle('mini:advanced',()=>operation(async()=>{
      if(state.advanced)return true;
      nativeTransition=true;state.advanced=true;state.ready=false;publish();
      try{await engine.disconnect();state.connected=false;await engine.shutdown();nativeInitial=await engine.start({native:true});capabilities(nativeInitial);return true;}
      catch(error){
        if(!engine.child||engine.child.exitCode!==null){state.advanced=false;capabilities(await engine.start());state.ready=true;}
        throw error;
      }finally{nativeTransition=false;}
    },{native:true}));
    handle('mini:close-advanced',()=>operation(()=>returnFromNative(),{native:true}));
    await window.loadFile(path.join(here,'../dist/index.html'));if(!process.argv.includes('--hidden'))window.show();
    if(app.isPackaged)app.setAsDefaultProtocolClient('mini-throne');
    if(demo){Object.assign(state,{ready:true,active:true,branding:{name:'Northline',accent:'#55ded4',logo:null},origin:'https://vpn.example.com',expiresAt:'2026-12-09T00:00:00Z',profiles:[{id:1,name:'Нидерланды',country:'NL',latency:42,type:'vless'},{id:2,name:'Германия',country:'DE',latency:57,type:'vless'},{id:3,name:'Швеция',country:'SE',latency:68,type:'vless'},{id:4,name:'Финляндия',country:'FI',latency:76,type:'vless'}],selected:1});publish();return;}
    engine=new Engine({ruleDirectory:app.isPackaged?path.join(process.resourcesPath,'rules'):path.join(here,'../assets/rules'),runtime:app.isPackaged?path.join(process.resourcesPath,'engine'):path.join(here,'../runtime'),data:path.join(directory,'engine'),guard:app.isPackaged?path.join(process.resourcesPath,'ProxyGuard.exe'):path.join(here,'../native/bin/ProxyGuard.exe'),onExit:({native})=>{state.connected=false;if(native&&!quitting&&!nativeTransition)void operation(()=>returnFromNative(),{native:true});else if(!quitting&&!nativeTransition)state.error='engine_stopped';publish();}});
    await operation(async()=>{
      const started=await engine.start();capabilities(started);state.ready=true;
      try{await consumeEnrollment({directory,account,request:api});}
      catch{state.error='enrollment_failed';}
      state.origin=account.value?.origin||null;
      await syncSources();
      if(state.sourceId===-1)await refresh();else await loadManual();
      if(privateConfig.tun){try{capabilities(await engine.setTun(true));}catch(error){state.error=error.code||'needs_privileges';}}
    });
    updater=await updates({app,onState:value=>{state.update=value;publish();},beforeInstall:async()=>{quitting=true;await shutdown();},isConnected:()=>state.connected||state.busy});
    const initialLink=process.argv.find(arg=>arg.startsWith('mini-throne:'));if(initialLink)link(initialLink);
    setInterval(async()=>{if(polling||state.busy||state.advanced||!state.ready||quitting)return;polling=true;try{const status=await engine.status();if(state.advanced||state.busy)return;capabilities(status);state.connected=status.state==='running';if(!state.connected)await engine.disableProxy();if(status.profile)state.selected=status.profile.id;publish();}catch{if(!state.advanced&&!state.busy){state.connected=false;state.error='engine_unavailable';publish();}}finally{polling=false;}},2500).unref();
    setInterval(()=>{if(state.sources.length&&!state.busy&&!state.advanced)void operation(refresh);},3600000).unref();
  }).catch(()=>{state.error='startup_failed';publish();});
}
