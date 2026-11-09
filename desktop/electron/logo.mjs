import {nativeImage} from 'electron';

// Decode WebP in Chromium: nativeImage only guarantees PNG/JPEG on Windows.
// Only raster bytes cross into an isolated world; no remote document is loaded.
export async function rasterLogo(bytes,webContents){
  if(!Buffer.isBuffer(bytes)||bytes.length>524288)return null;
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=bytes[0]===255&&bytes[1]===216;
  const webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!png&&!jpeg&&!webp)return null;
  if(!webp){
    const decoded=nativeImage.createFromBuffer(bytes);if(decoded.isEmpty())return null;
    const size=decoded.getSize(),scale=192/Math.max(size.width,size.height);
    return decoded.resize({width:Math.max(1,Math.round(size.width*scale)),height:Math.max(1,Math.round(size.height*scale)),quality:'good'}).toDataURL();
  }
  const data='data:image/webp;base64,'+bytes.toString('base64');
  return webContents.executeJavaScriptInIsolatedWorld(999,[{code:`(async()=>{
    const image=new Image();image.src=${JSON.stringify(data)};
    await Promise.race([image.decode(),new Promise((_,reject)=>setTimeout(()=>reject(Error('logo_timeout')),5000))]);
    if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth>8192||image.naturalHeight>8192)return null;
    const scale=192/Math.max(image.naturalWidth,image.naturalHeight),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');
  })()`}]);
}
