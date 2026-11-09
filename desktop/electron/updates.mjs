import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fetchRelease} from './release-manifest.mjs';
const require=createRequire(import.meta.url);

export async function updates({app,onState,beforeInstall,isConnected}) {
  if(!app.isPackaged){onState({status:'unconfigured'});return {check:async()=>{},install:async()=>{}};}
  const policy=JSON.parse(await fs.readFile(new URL('./update-config.json',import.meta.url),'utf8'));
  const {autoUpdater}=require('electron-updater');
  const semver=require('semver');
  autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false;
  autoUpdater.allowDowngrade=false;autoUpdater.allowPrerelease=false;autoUpdater.disableWebInstaller=true;
  // Ed25519 authenticates the exact executable hash before download. Authenticode
  // can additionally be enabled by the operator; its check is not bypassed here.
  autoUpdater.logger=null;
  let ready=null,checking=false,installing=false;
  autoUpdater.on('download-progress',p=>onState({status:'downloading',percent:Math.round(p.percent)}));
  autoUpdater.on('error',()=>onState({status:'error'}));
  async function verifyFile(file,expected){
    const stat=await fs.stat(file);if(stat.size!==expected.size)throw new Error('update_size_mismatch');
    const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
    if(hash.digest('hex')!==expected.sha256)throw new Error('update_digest_mismatch');
  }
  async function install(){
    if(!ready||installing)return;installing=true;
    try{await verifyFile(ready.file,ready.expected);await beforeInstall();autoUpdater.quitAndInstall(true,true);}
    catch{installing=false;onState({status:'error'});}
  }
  async function check(){
    if(checking||ready)return;checking=true;onState({status:'checking'});
    try{
      const release=await fetchRelease(policy);
      if(!semver.gt(release.version,app.getVersion())){onState({status:'current'});return;}
      const expected=release.files['Mini-Throne-Setup-x64.exe'];
      autoUpdater.setFeedURL({provider:'generic',url:`https://github.com/${policy.repository}/releases/download/v${release.version}/`,channel:'latest',useMultipleRangeRequest:false});
      const result=await autoUpdater.checkForUpdates();
      const info=result?.updateInfo,file=info?.files?.[0];
      if(info?.version!==release.version||info.files.length!==1||file.url!=='Mini-Throne-Setup-x64.exe'||file.sha512!==expected.sha512||file.size!==expected.size||info.packages)throw new Error('update_metadata_mismatch');
      const downloaded=await autoUpdater.downloadUpdate();
      if(downloaded.length!==1)throw new Error('unexpected_update_files');
      await verifyFile(downloaded[0],expected);ready={file:downloaded[0],expected};onState({status:'ready'});
      if(!isConnected())await install();
    }catch{onState({status:'error'});}finally{checking=false;}
  }
  void check();return {check,install};
}
