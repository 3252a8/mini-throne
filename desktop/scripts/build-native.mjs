import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
fs.mkdirSync('native/bin',{recursive:true});
const compiler=path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
execFileSync(compiler,['/nologo','/utf8output','/optimize+','/target:exe','/r:System.Web.Extensions.dll',`/out:${path.resolve('native/bin/ProxyGuard.exe')}`,path.resolve('native/ProxyGuard.cs')],{stdio:'inherit',windowsHide:true});
