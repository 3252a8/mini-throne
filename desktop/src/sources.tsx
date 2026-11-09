import {useEffect,useRef,useState} from 'react';
import {Dialog} from './ui';

export type Source={id:number;name:string;subscription:boolean;count:number;service:boolean};
const copy={
  ru:{file:'Открыть JSON-файл',title:'Подписки и серверы',add:'Добавить',subscription:'Подписка',servers:'Серверы',remove:'Удалить',confirm:'Удалить вместе с серверами?',yes:'Удалить',no:'Отмена',login:'Войти в сервис',error:'Не удалось выполнить действие. Проверьте ссылку и соединение.',current:'Выбрано',refresh:'Обновить выбранную подписку'},
  en:{file:'Open JSON file',title:'Subscriptions and servers',add:'Add',subscription:'Subscription',servers:'Servers',remove:'Remove',confirm:'Remove this source and its servers?',yes:'Remove',no:'Cancel',login:'Sign in to service',error:'Could not complete the action. Check the link and connection.',current:'Selected',refresh:'Refresh selected subscription'}
};
export function SourceManager({initialUrl='',language,sources,sourceId,busy,error,hasAccount,onClose,onLogin}:{initialUrl?:string;language:'ru'|'en';sources:Source[];sourceId:number|null;busy:boolean;error:string|null;hasAccount:boolean;onClose:()=>void;onLogin:()=>void}){
  const t=copy[language],edited=useRef(false);
  const [text,setText]=useState(initialUrl),[removing,setRemoving]=useState<number|null>(null);
  useEffect(()=>{if(initialUrl){edited.current=true;setText(initialUrl);}},[initialUrl]);
  useEffect(()=>{let cancelled=false;if(!initialUrl)void window.miniThrone.clipboard().then(value=>{if(!cancelled&&!edited.current)setText(value);}).catch(()=>{});return()=>{cancelled=true;};},[]);
  return <Dialog className="sources-dialog" title={sources.length?t.title:language==='ru'?'Добавить подписку или сервер':'Add subscription or server'} busy={busy} onClose={onClose}>
    {sources.length>0&&<div className="source-list">{sources.map(source=><div className="source-entry" key={source.id}>
      <button className="source-choice" disabled={busy||source.id===sourceId} onClick={async()=>{if(await window.miniThrone.selectSource(source.id))onClose();}}><strong>{source.name}</strong><small>{source.service?(language==='ru'?'Сервис':'Service'):source.subscription?t.subscription:t.servers}{source.id===sourceId?` · ${t.current}`:''}</small></button>
      {!source.service&&(removing===source.id?<div className="source-confirm"><span>{t.confirm}</span><button disabled={busy} onClick={async()=>{if(await window.miniThrone.removeSource(source.id))setRemoving(null);}}>{t.yes}</button><button disabled={busy} onClick={()=>setRemoving(null)}>{t.no}</button></div>:<button className="source-remove" aria-label={`${t.remove}: ${source.name}`} disabled={busy} onClick={()=>setRemoving(source.id)}>{t.remove}</button>)}
    </div>)}{sources.some(source=>source.id===sourceId&&source.subscription)&&<button className="text-button source-refresh" disabled={busy} onClick={()=>void window.miniThrone.refresh()}>{t.refresh}</button>}</div>}
    <form onSubmit={async event=>{event.preventDefault();if(await window.miniThrone.addSource({text}))onClose();}}>
      <label>{language==='ru'?'Ссылка или конфигурация':'Link or configuration'}<textarea value={text} maxLength={2097152} rows={4} required spellCheck={false} autoComplete="off" disabled={busy} placeholder="https://… / vless://… / JSON" onChange={event=>{edited.current=true;setText(event.target.value);}}/></label>
      <label className="json-file">{t.file}<input type="file" accept=".json,application/json" disabled={busy} onChange={async event=>{const file=event.target.files?.[0];edited.current=true;if(file&&file.size<=2097152)setText(await file.text());event.target.value='';}}/></label>
      {error&&<p className="error" role="alert">{t.error}</p>}
      <button className="primary" disabled={busy||!text.trim()}>{t.add}</button>
    </form>
    {!hasAccount&&<button className="text-button" disabled={busy} onClick={onLogin}>{t.login}</button>}
  </Dialog>;
}
