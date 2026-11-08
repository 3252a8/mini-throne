import net from 'node:net';
export function instanceOrigin(value, allowLoopback = false) {
  const url = new URL(value);
  if(url.username || url.password || url.hash || url.search || (url.pathname !== '/' && url.pathname !== '')) throw new Error('Enter the service origin only');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  const local=['localhost','127.0.0.1','::1'].includes(host);
  if(url.protocol !== 'https:' && !(allowLoopback && local && url.protocol === 'http:')) throw new Error('HTTPS is required');
  if(!allowLoopback && (local || net.isIP(host) || !host.includes('.') || host.endsWith('.local'))) throw new Error('A public service domain is required');
  return url.origin;
}
export function parseDeepLink(value) {
  if(typeof value !== 'string' || value.length > 2048) throw new Error('Invalid link');
  const url=new URL(value);
  if(url.protocol!=='mini-throne:' || url.hostname!=='connect' || !['','/'].includes(url.pathname) || url.hash || [...url.searchParams.keys()].some(key=>key!=='instance')) throw new Error('Invalid link');
  if(url.searchParams.getAll('instance').length!==1) throw new Error('Invalid link');
  return instanceOrigin(url.searchParams.get('instance'));
}
