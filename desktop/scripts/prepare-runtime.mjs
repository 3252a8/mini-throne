import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const lock=JSON.parse(await fs.readFile('engine.lock.json','utf8'));
const cache=path.resolve('.cache/engine');await fs.mkdir(cache,{recursive:true});
const archive=path.join(cache,lock.artifact);
let bytes;try{bytes=await fs.readFile(archive);}catch{}
if(!bytes||createHash('sha256').update(bytes).digest('hex')!==lock.sha256){
  const result=await fetch(`${lock.repository}/releases/download/${lock.version}/${lock.artifact}`);
  if(!result.ok)throw new Error(`Engine download failed: ${result.status}`);
  bytes=Buffer.from(await result.arrayBuffer());
  if(createHash('sha256').update(bytes).digest('hex')!==lock.sha256)throw new Error('Engine archive digest mismatch');
  await fs.writeFile(archive,bytes);
}
execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','$p=ConvertFrom-Json ([Console]::In.ReadToEnd()); Expand-Archive -LiteralPath $p.archive -DestinationPath $p.destination -Force'],{input:JSON.stringify({archive,destination:cache}),windowsHide:true});
await fs.mkdir('runtime',{recursive:true});
await fs.cp(path.join(cache,'Throne'),'runtime',{recursive:true});
console.log(`Verified Throne ${lock.version}: ${lock.sha256}`);
