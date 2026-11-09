export function renewalUrl(origin){
  const url=new URL(origin);
  if(url.protocol!=='https:'||url.username||url.password)throw new Error('unsafe_url');
  // Core retains this intent across browser sign-in and opens renewal checkout.
  return new URL('/?renew=1',url.origin).href;
}
