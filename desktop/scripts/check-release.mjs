import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyRelease} from '../electron/release-manifest.mjs';
import {parseImportLink,parseDeepLink} from '../electron/urls.mjs';

const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const policy={repository:'3252a8/mini-throne',publicKey:publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64')};
const data={schema:1,repository:policy.repository,version:'0.1.0',files:{'Mini-Throne-Setup-x64.exe':{size:100,sha256:'a'.repeat(64),sha512:Buffer.alloc(64).toString('base64')}}};
const envelope=value=>{const raw=Buffer.from(JSON.stringify(value));return {manifest:raw.toString('base64'),signature:sign(null,raw,privateKey).toString('base64')};};
assert.equal(verifyRelease(envelope(data),policy).version,'0.1.0');
assert.throws(()=>verifyRelease({...envelope(data),signature:Buffer.alloc(64).toString('base64')},policy));
assert.throws(()=>verifyRelease(envelope({...data,repository:'another/repo'}),policy));
assert.throws(()=>verifyRelease(envelope({...data,version:'../../bad'}),policy));
const nested='https://example.com/subscription?format=singbox&flag=a%2Bb#profile';
assert.equal(parseImportLink('mini-throne://import/'+nested),nested);
assert.equal(parseImportLink('mini-throne://import/'+encodeURIComponent(nested)),nested);
for(const bad of ['file:///etc/passwd','javascript:alert(1)','https://user:password@example.com/sub'])assert.throws(()=>parseImportLink('mini-throne://import/'+bad));
assert.equal(parseDeepLink('mini-throne://connect?instance=https%3A%2F%2Fexample.com'),'https://example.com');
console.log('Signed manifest, tamper rejection, repository pin, import deep links: passed');
