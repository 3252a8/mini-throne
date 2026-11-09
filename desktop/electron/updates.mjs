import fs from 'node:fs/promises';
import {net} from 'electron';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {fetchRelease} from './release-manifest.mjs';
const require=createRequire(import.meta.url);

export async function updates({app,onState,beforeInstall,isConnected,updater:providedUpdater,releaseLoader=fetchRelease}) {
  if(!app.isPackaged){onState({status:'unconfigured'});return {startup:Promise.resolve('unconfigured'),check:async()=>{},install:async()=>{},defer:()=>{}};}
  const policy=JSON.parse(await fs.readFile(new URL('./update-config.json',import.meta.url),'utf8'));
  const autoUpdater=providedUpdater||require('electron-updater').autoUpdater,semver=require('semver');
  autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false;
  autoUpdater.allowDowngrade=false;autoUpdater.allowPrerelease=false;autoUpdater.disableWebInstaller=true;
  // The signed manifest authenticates the exact executable. Keep Authenticode
  // verification enabled if configured by the publisher.
  autoUpdater.logger=null;
  autoUpdater.requestHeaders={'Cache-Control':'no-cache'};
  // Metadata/network failures must never prevent the installed app from opening.
  let downloadTimer=null,downloadFailed=null;
  let ready=null,checking=false,installing=false,deferred=false,timer=null,state={};
  let finishStartup,retryTimer;
  const startup=new Promise(resolve=>{finishStartup=resolve;});
  const publish=patch=>{state={...state,...patch};onState(state);if(['current','error'].includes(state.status)||state.deferred)finishStartup(state.status);};
  const cancel=()=>{clearTimeout(timer);timer=null;};
  const failed=()=>{cancel();installing=false;ready=null;publish({status:'error',restartAt:null});};
  const resetDownloadTimeout=()=>{clearTimeout(downloadTimer);if(downloadFailed){downloadTimer=setTimeout(downloadFailed,30000);downloadTimer.unref();}};
  autoUpdater.on('download-progress',p=>{resetDownloadTimeout();publish({status:'downloading',percent:Math.max(0,Math.min(100,Math.round(p.percent||0))),transferred:p.transferred,total:p.total,bytesPerSecond:p.bytesPerSecond});});
  autoUpdater.on('error',failed);
  async function verifyFile(file,expected){
    const stat=await fs.stat(file);if(stat.size!==expected.size)throw new Error('update_size_mismatch');
    const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
    if(hash.digest('hex')!==expected.sha256)throw new Error('update_digest_mismatch');
  }
  async function install(){
    if(!ready||installing)return;cancel();installing=true;
    publish({status:'installing',restartAt:null});
    try{
      await Promise.all([verifyFile(ready.file,ready.expected),delay(500)]);
      await beforeInstall();
      // One-click NSIS installs automatically and shows real extraction progress
      // after Electron exits. No second helper or silent blank interval.
      autoUpdater.quitAndInstall(false,true);
    }catch{failed();}
  }
  function reconcile(){
    if(!ready||installing||deferred)return;
    if(isConnected()){
      if(state.status==='countdown'){cancel();publish({status:'ready',restartAt:null});}
      return;
    }
    if(timer)return;
    publish({status:'countdown',restartAt:Date.now()+3000});
    timer=setTimeout(()=>{timer=null;if(!isConnected()&&!deferred)void install();else publish({status:'ready',restartAt:null});},3000);
    timer.unref();
  }
  async function check(){
    if(checking)return;if(ready){deferred=false;publish({deferred:false});reconcile();return;}
    checking=true;publish({status:'checking',percent:0,transferred:0,total:0,bytesPerSecond:0,nextVersion:null,restartAt:null});
    try{
      const release=await releaseLoader(policy,net.fetch);
      if(!semver.gt(release.version,app.getVersion())){publish({status:'current'});return;}
      const expected=release.files['Mini-Throne-Setup-x64.exe'];
      publish({status:'downloading',nextVersion:release.version});
      autoUpdater.setFeedURL({provider:'generic',url:`https://github.com/${policy.repository}/releases/download/v${release.version}/`,channel:'latest',useMultipleRangeRequest:false});
      let metadataTimer;
      const result=await Promise.race([autoUpdater.checkForUpdates(),new Promise((_,reject)=>{metadataTimer=setTimeout(()=>reject(new Error('update_metadata_timeout')),15000);})]).finally(()=>clearTimeout(metadataTimer));
      const info=result?.updateInfo,file=info?.files?.[0];
      if(info?.version!==release.version||info.files.length!==1||file.url!=='Mini-Throne-Setup-x64.exe'||file.sha512!==expected.sha512||file.size!==expected.size||info.packages)throw new Error('update_metadata_mismatch');
      const {CancellationToken}=require('builder-util-runtime');
      const cancellation=new CancellationToken();
      const stalled=new Promise((_,reject)=>{downloadFailed=()=>{cancellation.cancel();reject(new Error('download_stalled'));};resetDownloadTimeout();});
      const downloaded=await Promise.race([autoUpdater.downloadUpdate(cancellation),stalled]).finally(()=>{clearTimeout(downloadTimer);downloadFailed=null;});
      if(downloaded.length!==1)throw new Error('unexpected_update_files');
      publish({status:'verifying',percent:100});
      await verifyFile(downloaded[0],expected);ready={file:downloaded[0],expected};publish({status:'ready'});reconcile();
    }catch{failed();}finally{checking=false;clearTimeout(retryTimer);if(!ready){retryTimer=setTimeout(()=>void check(),state.status==='error'?60000:3600000);retryTimer.unref();}}
  }
  const interval=setInterval(reconcile,1000);interval.unref();
  app.once('before-quit',()=>{clearInterval(interval);clearTimeout(retryTimer);cancel();});
  void check();return {startup,check,install,defer:()=>{if(!ready||installing)return;deferred=true;cancel();publish({status:'ready',deferred:true,restartAt:null});}};
}
