import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

export async function updates({app,onState,beforeInstall,isConnected}) {
  let config;try{config=JSON.parse(await fs.readFile(new URL('./update-config.json',import.meta.url),'utf8'));}catch{}
  // A private repository is not a downloadable update feed. Test builds never
  // embed a forge credential or accept an executable URL from a service instance.
  if(!app.isPackaged||!config?.url||!config?.publisherName){onState({status:'unconfigured'});return {check:async()=>{},install:async()=>{}};}
  const feed=new URL(config.url);
  if(feed.protocol!=='https:'||feed.username||feed.password)throw new Error('invalid_update_feed');
  const {autoUpdater}=require('electron-updater');
  const installed=await autoUpdater.configOnDisk.value;
  const publishers=Array.isArray(installed.publisherName)?installed.publisherName:[installed.publisherName];
  if(!publishers.includes(config.publisherName))throw new Error('update_publisher_not_pinned');
  autoUpdater.setFeedURL({provider:'generic',url:feed.href});
  autoUpdater.autoDownload=true;autoUpdater.autoInstallOnAppQuit=false;autoUpdater.allowDowngrade=false;
  autoUpdater.allowPrerelease=true;autoUpdater.disableWebInstaller=true;
  // electron-updater requires app-update.yml's publisherName for Authenticode.
  let ready=false;
  autoUpdater.on('checking-for-update',()=>onState({status:'checking'}));
  autoUpdater.on('download-progress',progress=>onState({status:'downloading',percent:Math.round(progress.percent)}));
  autoUpdater.on('update-not-available',()=>onState({status:'current'}));
  autoUpdater.on('error',()=>onState({status:'error'}));
  async function install(){if(!ready)return;await beforeInstall();autoUpdater.quitAndInstall(true,true);}
  autoUpdater.on('update-downloaded',()=>{ready=true;onState({status:'ready'});if(!isConnected())void install();});
  async function check(){try{await autoUpdater.checkForUpdates();}catch{onState({status:'error'});}}
  void check();return {check,install};
}
