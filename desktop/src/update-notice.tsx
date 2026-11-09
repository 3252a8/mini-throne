import {useEffect,useState} from 'react';
export type Update={status:string;percent?:number;transferred?:number;total?:number;bytesPerSecond?:number;nextVersion?:string;restartAt?:number|null};
export function UpdateNotice({update:u,language,connected,onInstall,onDefer,onCheck}:{update:Update;language:'ru'|'en';connected:boolean;onInstall:()=>void;onDefer:()=>void;onCheck:()=>void}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{if(u.status!=='countdown')return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer);},[u.status]);
  if(!['checking','downloading','verifying','countdown','ready','installing','error'].includes(u.status))return null;
  const ru=language==='ru',seconds=Math.max(0,Math.ceil(((u.restartAt||now)-now)/1000));
  const labels=ru?{checking:'Проверяем обновления',downloading:'Загружаем обновление',verifying:'Проверяем файл',countdown:`Перезапуск через ${seconds} с`,ready:'Обновление готово',installing:'Устанавливаем обновление',error:'Не удалось обновить приложение'}:{checking:'Checking for updates',downloading:'Downloading update',verifying:'Verifying download',countdown:`Restarting in ${seconds}s`,ready:'Update ready',installing:'Installing update',error:'Could not update the app'};
  const mb=(bytes:number)=>`${(bytes/1048576).toLocaleString(language,{maximumFractionDigits:1})} ${ru?'МиБ':'MiB'}`;
  const determined=u.status==='downloading'&&!!u.total;
  return <aside className={`update-notice update-${u.status}`} aria-label={ru?'Обновление приложения':'App update'}>
    <div className="update-heading"><strong role="status">{labels[u.status as keyof typeof labels]}</strong><span>{determined?`${u.percent||0}%`:u.nextVersion?`v${u.nextVersion}`:''}</span></div>
    {!['error','ready','countdown'].includes(u.status)&&<progress aria-label={labels[u.status as keyof typeof labels]} max={100} value={determined?u.percent:undefined}/>}
    {determined&&<p className="update-transfer">{mb(u.transferred||0)} / {mb(u.total||0)}{u.bytesPerSecond?` · ${mb(u.bytesPerSecond)}/${ru?'с':'s'}`:''}</p>}
    {u.status==='installing'&&<p>{ru?'Приложение откроется автоматически.':'The app will reopen automatically.'}</p>}
    {u.status==='ready'&&<p>{connected?(ru?'Установим после отключения.':'Will install after you disconnect.'):(ru?'Можно установить в удобный момент.':'Install when convenient.')}</p>}
    {['ready','countdown'].includes(u.status)&&<div className="update-actions">{u.status==='countdown'&&<button onClick={onDefer}>{ru?'Позже':'Later'}</button>}<button onClick={onInstall}>{ru?'Перезапустить сейчас':'Restart now'}</button></div>}
    {u.status==='error'&&<div className="update-actions"><button onClick={onCheck}>{ru?'Повторить':'Retry'}</button></div>}
  </aside>;
}
