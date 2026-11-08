import net from 'node:net';
import {createHmac, createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';

export function deriveKeys(key, serverHello, clientRandom) {
  if (key.length !== 32 || serverHello.length !== 16 || clientRandom.length !== 16) throw new Error('Invalid API key or hello');
  return Object.fromEntries(['c2s', 's2c'].map(dir => [dir, createHmac('sha256', key).update(`throne-api/1 ${dir}`).update(serverHello).update(clientRandom).digest()]));
}
export function seal(key, counter, plaintext) {
  const length = Buffer.alloc(4); length.writeUInt32BE(plaintext.length + 16);
  const nonce = Buffer.alloc(12); nonce.writeBigUInt64BE(BigInt(counter), 4);
  const cipher = createCipheriv('chacha20-poly1305', key, nonce, {authTagLength:16});
  cipher.setAAD(length, {plaintextLength:plaintext.length});
  return Buffer.concat([length, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
}
export function open(key, counter, frame) {
  if (frame.length < 20 || frame.readUInt32BE() !== frame.length - 4 || frame.length > 67108868) throw new Error('Invalid frame length');
  const nonce = Buffer.alloc(12); nonce.writeBigUInt64BE(BigInt(counter), 4);
  const cipher = createDecipheriv('chacha20-poly1305', key, nonce, {authTagLength:16});
  cipher.setAAD(frame.subarray(0,4), {plaintextLength:frame.length - 20});
  cipher.setAuthTag(frame.subarray(-16));
  return Buffer.concat([cipher.update(frame.subarray(4,-16)), cipher.final()]);
}

// One authenticated exchange per connection: no replay counters shared across callers.
export function request({port, key}, method, path, body, query, timeout = 75000) {
  const payload = Buffer.from(JSON.stringify({method,path,...(body === undefined ? {} : {body}),...(query ? {query} : {})}));
  if (payload.length + 16 > 1048576) throw new Error('Request is too large');
  return new Promise((resolve,reject) => {
    const socket = net.createConnection({host:'127.0.0.1',port});
    const clientRandom = randomBytes(16);
    let buffer = Buffer.alloc(0), keys, done = false;
    const finish = (error,value) => {if(done)return;done=true;socket.destroy();error?reject(error):resolve(value);};
    socket.setTimeout(timeout,()=>finish(new Error('Engine response timed out')));
    socket.on('error',error=>finish(error));
    socket.on('close',()=>{if(!done)finish(new Error('Engine connection closed'));});
    socket.on('connect',()=>socket.write(Buffer.concat([Buffer.from([1]),clientRandom])));
    socket.on('data',chunk=>{
      try {
        buffer = Buffer.concat([buffer,chunk]);
        if (!keys && buffer.length >= 16) {
          keys = deriveKeys(key,buffer.subarray(0,16),clientRandom);buffer=buffer.subarray(16);
          socket.write(seal(keys.c2s,0,payload));
        }
        if (!keys || buffer.length < 4) return;
        const size = buffer.readUInt32BE();
        if (size < 16 || size > 67108864) throw new Error('Invalid engine response size');
        if (buffer.length < size + 4) return;
        const response = JSON.parse(open(keys.s2c,0,buffer.subarray(0,size+4)).toString('utf8'));
        if(response.status < 200 || response.status >= 300) {
          const error=new Error(response.error?.code || 'engine_error');error.code=response.error?.code;throw error;
        }
        finish(null,response.body);
      } catch(error) {finish(error);}
    });
  });
}
