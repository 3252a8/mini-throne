import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';

// Throne 1.4.1 has no GUI command-line API override. Configure only its local
// management listener, after its process has exited and released this database.
// Functional settings and profiles remain owned by Throne.
export function prepareNativeApi(data,port,key) {
  const db=new DatabaseSync(path.join(data,'config/throne.db'),{timeout:3000});
  try {
    const columns=db.prepare('PRAGMA table_info(settings)').all();
    if(columns.length!==2||columns[0].name!=='key'||columns[1].name!=='value')throw new Error('unsupported_engine_schema');
    db.exec('BEGIN IMMEDIATE');
    const put=db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    for(const [name,value] of Object.entries({remote_api_enable:'true',remote_api_lan:'false',remote_api_admin_lan:'false',remote_api_port:String(port),remote_api_key:key.toString('base64url')}))put.run(name,value);
    db.exec('COMMIT');
  } finally {db.close();}
}

export function readNativeModes(data){
  const db=new DatabaseSync(path.join(data,'config/throne.db'),{readOnly:true});
  try{
    const get=name=>['true','1'].includes(db.prepare('SELECT value FROM settings WHERE key=?').get(name)?.value);
    return {tun:get('tun_mode_enabled'),system_proxy:get('system_proxy_enabled')};
  }finally{db.close();}
}
