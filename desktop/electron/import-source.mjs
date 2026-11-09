import {parseDeepLink,parseImportLink} from './urls.mjs';

// Determine the format in the trusted process; the UI only accepts pasted text.
export function importSource(value) {
  if(typeof value!=='string'||Buffer.byteLength(value)>2097152||!value.trim())throw new Error('invalid_import');
  let text=value.trim();
  if(text.startsWith('mini-throne://connect'))return {origin:parseDeepLink(text)};
  if(text.startsWith('mini-throne://import/'))text=parseImportLink(text);
  if(/^[\[{]/.test(text))return {kind:'json',name:'',text};
  if(/^https?:\/\//i.test(text)&&!/[\r\n]/.test(text)){
    const url=new URL(text);
    return {kind:url.username||url.password||url.pathname==='/'&&url.hash?'servers':'subscription',name:'',text};
  }
  // Subscription exports can also be a base64-encoded list of server links.
  if(/^[A-Za-z0-9+/_=\s-]+$/.test(text)){
    const decoded=Buffer.from(text.replace(/\s/g,''),'base64').toString('utf8').trim();
    if(/^[-a-z0-9+]+:\/\//i.test(decoded))text=decoded;
  }
  return {kind:'servers',name:'',text};
}

export function localProxy(value) {
  if(typeof value!=='string'||value.length>64)throw new Error('invalid_proxy_address');
  const match=/^(?:127\.0\.0\.1|localhost):(\d{1,5})$/.exec(value.trim());
  const port=Number(match?.[1]);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('invalid_proxy_address');
  return {address:'127.0.0.1',port};
}
