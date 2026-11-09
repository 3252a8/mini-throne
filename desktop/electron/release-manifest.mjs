import {createPublicKey,verify} from 'node:crypto';

export function verifyRelease(envelope,policy) {
  if(typeof envelope?.manifest!=='string'||typeof envelope?.signature!=='string')throw new Error('invalid_release');
  const bytes=Buffer.from(envelope.manifest,'base64');
  const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(policy.publicKey,'base64')]),format:'der',type:'spki'});
  if(bytes.length>32768||!verify(null,bytes,key,Buffer.from(envelope.signature,'base64')))throw new Error('invalid_release_signature');
  const data=JSON.parse(bytes.toString('utf8'));
  if(data.schema!==1||data.repository!==policy.repository||!/^\d+\.\d+\.\d+$/.test(data.version))throw new Error('invalid_release');
  const installer=data.files?.['Mini-Throne-Setup-x64.exe'];
  if(!installer||!Number.isSafeInteger(installer.size)||installer.size<1||installer.size>400*1024*1024||!/^[a-f0-9]{64}$/.test(installer.sha256)||Buffer.from(installer.sha512||'','base64').length!==64)throw new Error('invalid_installer');
  return data;
}

export async function fetchRelease(policy) {
  const response=await fetch(`https://github.com/${policy.repository}/releases/latest/download/release-manifest.json`,{signal:AbortSignal.timeout(20000),headers:{'Cache-Control':'no-cache'}});
  if(!response.ok)throw new Error('release_unavailable');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>49152)throw new Error('release_too_large');chunks.push(chunk);}
  return verifyRelease(JSON.parse(Buffer.concat(chunks).toString('utf8')),policy);
}
