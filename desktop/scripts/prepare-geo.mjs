import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const directory=new URL('../assets/geo/',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',directory),'utf8'));
for(const [name,expected] of Object.entries(manifest.files)){
  if(!['geoip.dat','geosite.dat'].includes(name))throw Error('Unexpected geo asset');
  const target=new URL(name,directory);
  const valid=bytes=>bytes.length===expected.size&&createHash('sha256').update(bytes).digest('hex')===expected.sha256;
  let bytes;try{bytes=await fs.readFile(target);}catch{}
  if(!bytes||!valid(bytes)){
    const response=await fetch(`https://raw.githubusercontent.com/Loyalsoldier/v2ray-rules-dat/${manifest.commit}/${name}`,{signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw Error('Geo download failed');bytes=Buffer.from(await response.arrayBuffer());
    if(!valid(bytes))throw Error('Geo digest mismatch');await fs.writeFile(target,bytes);
  }
  console.log(`Verified bundled ${path.basename(name)}: ${expected.sha256}`);
}
