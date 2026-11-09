import fs from 'node:fs/promises';
import path from 'node:path';
import {instanceOrigin} from './urls.mjs';

export function parseInstallerFilename(filename) {
  if(typeof filename!=='string'||filename.length>255)throw new Error('invalid_enrollment');
  // Edge/Chrome append " (1)" when the same file is downloaded twice.
  const match=/^Mini-Throne-Setup--mt1\.([A-Za-z0-9_-]{1,140})\.([A-Za-z0-9_-]{43})(?: \([0-9]{1,6}\))?\.exe$/i.exec(filename);
  if(!match)throw new Error('invalid_enrollment');
  const decoded=Buffer.from(match[1],'base64url');
  if(decoded.toString('base64url')!==match[1])throw new Error('invalid_enrollment');
  const raw=decoded.toString('utf8');
  const origin=instanceOrigin(raw);
  if(origin!==raw)throw new Error('invalid_enrollment');
  return {origin,ticket:match[2]};
}

export async function consumeEnrollment({directory,account,request}) {
  const pending=path.join(directory,'pending-installer.txt');
  const legacy=path.join(directory,'pending-enrollment.json');
  try{
    // Preserve existing accounts, even if a different personalized EXE is run.
    if(account.value)return;
    let enrollment;
    try{
      const stat=await fs.stat(pending);
      if(stat.size>1024)throw new Error('invalid_enrollment');
      enrollment=parseInstallerFilename((await fs.readFile(pending,'utf16le')).replace(/^\uFEFF/,''));
    }catch(error){
      if(error.code!=='ENOENT')throw error;
      try{
        const stat=await fs.stat(legacy);
        if(stat.size>8192)throw new Error('invalid_enrollment');
        enrollment=JSON.parse(await fs.readFile(legacy,'utf8'));
        if(enrollment.protocol!==1||!Number.isFinite(enrollment.expires_at)||Date.now()>enrollment.expires_at*1000)throw new Error('enrollment_expired');
        enrollment.origin=instanceOrigin(enrollment.origin);
      }catch(legacyError){if(legacyError.code==='ENOENT')return;throw legacyError;}
    }
    const {data}=await request(enrollment.origin,'/api/plugins/mini-throne/v1/enroll/redeem',{method:'POST',body:{ticket:enrollment.ticket}});
    account.setTokens(enrollment.origin,data);
    await account.save();
  }finally{
    await Promise.all([fs.rm(pending,{force:true}),fs.rm(legacy,{force:true})]);
  }
}
