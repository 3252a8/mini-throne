import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const desktop=path.resolve(fileURLToPath(new URL('../',import.meta.url))),core=path.resolve(desktop,'../core');
const cache=path.join(desktop,'.cache/core-tools');await fs.mkdir(cache,{recursive:true});
const go=process.env.GO_BIN||'go';
const env={...process.env,CGO_ENABLED:'0',GOBIN:cache};
const run=(file,args,options={})=>execFileSync(file,args,{cwd:core,env,windowsHide:true,stdio:'inherit',...options});
if(!execFileSync(go,['version'],{env,encoding:'utf8',windowsHide:true}).startsWith('go version go1.27.3 '))throw Error('Go 1.27.3 required');
const checksum='6d7ebdc75e9c1f0026d4fb28f17ef1d0aae77d36744d83a9e052d79ba493724f',archive=path.join(cache,'protoc-34.1-win64.zip');
let bytes;try{bytes=await fs.readFile(archive);}catch{}
if(!bytes||createHash('sha256').update(bytes).digest('hex')!==checksum){
  const response=await fetch('https://github.com/protocolbuffers/protobuf/releases/download/v34.1/protoc-34.1-win64.zip',{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error('Protoc download failed');bytes=Buffer.from(await response.arrayBuffer());
  if(createHash('sha256').update(bytes).digest('hex')!==checksum)throw Error('Protoc digest mismatch');await fs.writeFile(archive,bytes);
}
run('powershell.exe',['-NoProfile','-NonInteractive','-Command','$p=ConvertFrom-Json ([Console]::In.ReadToEnd()); Expand-Archive -LiteralPath $p.archive -DestinationPath $p.destination -Force'],{stdio:['pipe','inherit','inherit'],input:JSON.stringify({archive,destination:cache})});
run(go,['install','google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.12']);
run(go,['install','google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.6.2']);
run(path.join(cache,'bin/protoc.exe'),['-I','gen',`--plugin=protoc-gen-go=${path.join(cache,'protoc-gen-go.exe')}`,`--plugin=protoc-gen-go-grpc=${path.join(cache,'protoc-gen-go-grpc.exe')}`,'--go_out=gen','--go-grpc_out=gen','gen/libcore.proto']);
const tags='with_clash_api,with_quic,with_wireguard,with_utls,with_dhcp,with_tailscale,with_openvpn,with_openconnect,badlinkname,tfogo_checklinkname0,with_purego,with_naive_outbound';
const flags='-w -s -X github.com/sagernet/sing-box/constant.Version=1.15.0-alpha.13 -X internal/godebug.defaultGODEBUG=multipathtcp=0 -checklinkname=0';
run(go,['test','-ldflags=-checklinkname=0','-tags',tags,'./internal/xray','./internal/probe','./internal/rpc']);
run(go,['build','-trimpath','-ldflags',flags,'-tags',tags,'-o',path.join(desktop,'runtime/ThroneCore.exe'),'.']);
