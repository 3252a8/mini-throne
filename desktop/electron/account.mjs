import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {api} from './http.mjs';
import {instanceOrigin} from './urls.mjs';

const PREFIX='/api/plugins/mini-throne/v1';
export class Account {
  constructor({directory,safeStorage,openBrowser,onLogin,allowLocal=false}){Object.assign(this,{directory,safeStorage,openBrowser,onLogin,allowLocal});this.value=null;this.generation=0;}
  async load(){
    try{this.value=JSON.parse(this.safeStorage.decryptString(await fs.readFile(path.join(this.directory,'account.bin'))));}catch{this.value=null;}
    return this.value;
  }
  async save(){
    if(!this.safeStorage.isEncryptionAvailable())throw new Error('secure_storage_unavailable');
    await fs.mkdir(this.directory,{recursive:true});
    const target=path.join(this.directory,'account.bin');
    await fs.writeFile(`${target}.tmp`,this.safeStorage.encryptString(JSON.stringify(this.value)),{mode:0o600});
    await fs.rename(`${target}.tmp`,target);
  }
  cancel(){this.generation++;}
  async login(raw) {
    const origin=instanceOrigin(raw,this.allowLocal),generation=++this.generation;
    const {data:discovery}=await api(origin,`${PREFIX}/discovery`,{allowLocal:this.allowLocal});
    if(discovery.protocol!==1)throw new Error('unsupported_service');
    const verifier=randomBytes(32).toString('base64url');
    const {data:device}=await api(origin,`${PREFIX}/device`,{method:'POST',allowLocal:this.allowLocal,body:{code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',device_name:'Mini Throne · Windows'}});
    const browser=new URL(device.verification_uri);
    if(browser.origin!==origin||browser.username||browser.password||browser.hash)throw new Error('unsafe_redirect');
    if(!/^[A-F0-9]{4}-[A-F0-9]{4}$/.test(device.user_code))throw new Error('invalid_service_response');
    this.onLogin({origin,code:device.user_code,waiting:true});
    await this.openBrowser(browser.href);
    const expires=Date.now()+Math.min(Number(device.expires_in)||300,300)*1000;
    while(generation===this.generation&&Date.now()<expires){
      await delay(3000);
      if(generation!==this.generation)return false;
      let result;
      try{result=await api(origin,`${PREFIX}/token`,{method:'POST',allowLocal:this.allowLocal,body:{device_code:device.device_code,code_verifier:verifier}});}catch(error){if(error.status===429)continue;throw error;}
      if(result.status===202)continue;
      if(generation!==this.generation)return false;
      this.setTokens(origin,result.data);await this.save();this.onLogin(null);return true;
    }
    if(generation===this.generation)throw new Error('request_expired');
    return false;
  }
  setTokens(origin,data){
    if(!/^[\w-]{43}$/.test(data.access_token)||!/^[\w-]{43}$/.test(data.refresh_token))throw new Error('invalid_service_response');
    this.value={origin,accessToken:data.access_token,refreshToken:data.refresh_token,expires:Date.now()+Number(data.expires_in)*1000,sessionId:data.session_id};
  }
  async authorized(path,options={}) {
    if(!this.value)throw new Error('login_required');
    if(Date.now()>this.value.expires-60000){
      const {data}=await api(this.value.origin,`${PREFIX}/refresh`,{method:'POST',allowLocal:this.allowLocal,body:{refresh_token:this.value.refreshToken}});
      this.setTokens(this.value.origin,data);await this.save();
    }
    return (await api(this.value.origin,PREFIX+path,{...options,token:this.value.accessToken,allowLocal:this.allowLocal})).data;
  }
  async logout(){
    this.cancel();
    let revoked=true;
    if(this.value){try{await this.authorized('/revoke',{method:'POST',body:{}});}catch{revoked=false;}}
    await this.forget();return revoked;
  }
  async forget(){this.cancel();this.value=null;await fs.rm(path.join(this.directory,'account.bin'),{force:true});}
}
