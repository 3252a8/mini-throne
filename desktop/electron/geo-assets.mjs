import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function installGeoAssets(bundle,data){
  const manifest=JSON.parse(await fs.readFile(path.join(bundle,'manifest.json'),'utf8'));
  const marker=path.join(data,'mini-geo-assets.json');
  let previous={};try{previous=JSON.parse(await fs.readFile(marker,'utf8'));}catch{}
  const installed={...previous};
  for(const name of ['geoip.dat','geosite.dat']){
    const expected=manifest.files[name],target=path.join(data,name);
    let current;try{current=digest(await fs.readFile(target));}catch(error){if(error.code!=='ENOENT')throw error;}
    // Preserve manually installed/custom databases. Upgrade only our own older copy.
    if(current&&current!==previous[name]&&current!==expected.sha256)continue;
    if(current!==expected.sha256){
      const bytes=await fs.readFile(path.join(bundle,name));
      if(bytes.length!==expected.size||digest(bytes)!==expected.sha256)throw new Error('geo_integrity_failed');
      const temporary=target+'.mini-tmp';await fs.writeFile(temporary,bytes);await fs.rename(temporary,target);
    }
    installed[name]=expected.sha256;
  }
  await fs.writeFile(marker,JSON.stringify(installed));
}
