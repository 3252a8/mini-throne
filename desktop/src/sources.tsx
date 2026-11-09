import {useEffect,useRef,useState} from 'react';

export type Source={id:number;name:string;subscription:boolean;count:number;service:boolean};
const copy={
  ru:{json:'JSON-конфигурация',file:'Открыть JSON-файл',jsonHint:'Полный Xray JSON сохраняет правила маршрутизации и балансировщики сервиса.',title:'Подписки и серверы',add:'Добавить',subscription:'Подписка',servers:'Серверы',kind:'Что добавить',name:'Название — необязательно',link:'Ссылка подписки',links:'Ссылка сервера',hint:'Можно вставить несколько ссылок, по одной в строке. VLESS, VMess, Shadowsocks, Trojan, SOCKS и другие форматы Throne.',subHint:'Подписка будет обновляться автоматически. Можно использовать без входа в сервис.',close:'Закрыть',remove:'Удалить',confirm:'Удалить вместе с серверами?',yes:'Удалить',no:'Отмена',login:'Войти в сервис',error:'Не удалось выполнить действие. Проверьте ссылку и соединение.',current:'Выбрано',optional:'Например, личная подписка',refresh:'Обновить выбранную подписку'},
  en:{json:'JSON configuration',file:'Open JSON file',jsonHint:'Complete Xray JSON preserves the service routing rules and balancers.',title:'Subscriptions and servers',add:'Add',subscription:'Subscription',servers:'Servers',kind:'What to add',name:'Name — optional',link:'Subscription URL',links:'Server link',hint:'Paste one or more links, one per line. VLESS, VMess, Shadowsocks, Trojan, SOCKS and other Throne formats.',subHint:'The subscription updates automatically. No service account is required.',close:'Close',remove:'Remove',confirm:'Remove this source and its servers?',yes:'Remove',no:'Cancel',login:'Sign in to service',error:'Could not complete the action. Check the link and connection.',current:'Selected',optional:'For example, personal subscription',refresh:'Refresh selected subscription'}
};
export function SourceManager({initialUrl='',language,sources,sourceId,busy,error,hasAccount,onClose,onLogin}:{initialUrl?:string;language:'ru'|'en';sources:Source[];sourceId:number|null;busy:boolean;error:string|null;hasAccount:boolean;onClose:()=>void;onLogin:()=>void}){
  const t=copy[language],dialog=useRef<HTMLDialogElement>(null);
  const [kind,setKind]=useState<'subscription'|'servers'|'json'>('subscription'),[name,setName]=useState(''),[text,setText]=useState(initialUrl),[removing,setRemoving]=useState<number|null>(null);
  useEffect(()=>{if(initialUrl){setText(initialUrl);setKind('subscription');}},[initialUrl]);
  useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
  return <dialog className="sources-dialog" ref={dialog} onCancel={event=>{event.preventDefault();if(!busy)onClose();}} aria-labelledby="sources-title">
    <div className="sources-heading"><h2 id="sources-title">{t.title}</h2><button className="icon-button" onClick={onClose} disabled={busy} aria-label={t.close}>×</button></div>
    {sources.length>0&&<div className="source-list">{sources.map(source=><div className="source-entry" key={source.id}>
      <button className="source-choice" disabled={busy||source.id===sourceId} onClick={async()=>{if(await window.miniThrone.selectSource(source.id))onClose();}}><strong>{source.name}</strong><small>{source.service?(language==='ru'?'Сервис':'Service'):source.subscription?t.subscription:t.servers}{source.id===sourceId?` · ${t.current}`:''}</small></button>
      {!source.service&&(removing===source.id?<div className="source-confirm"><span>{t.confirm}</span><button disabled={busy} onClick={async()=>{if(await window.miniThrone.removeSource(source.id))setRemoving(null);}}>{t.yes}</button><button disabled={busy} onClick={()=>setRemoving(null)}>{t.no}</button></div>:<button className="source-remove" aria-label={`${t.remove}: ${source.name}`} disabled={busy} onClick={()=>setRemoving(source.id)}>{t.remove}</button>)}
    </div>)}{sources.some(source=>source.id===sourceId&&source.subscription)&&<button className="text-button source-refresh" disabled={busy} onClick={()=>void window.miniThrone.refresh()}>{t.refresh}</button>}</div>}
    <form onSubmit={async event=>{event.preventDefault();if(await window.miniThrone.addSource({kind,name,text}))onClose();}}>
      <label>{t.kind}<select value={kind} disabled={busy} onChange={event=>setKind(event.target.value as typeof kind)}><option value="subscription">{t.subscription}</option><option value="servers">{t.servers}</option><option value="json">{t.json}</option></select></label>
      <label>{t.name}<input maxLength={80} value={name} placeholder={t.optional} disabled={busy} onChange={event=>setName(event.target.value)}/></label>
      <label>{kind==='subscription'?t.link:kind==='json'?t.json:t.links}<textarea value={text} maxLength={2097152} rows={3} required spellCheck={false} autoComplete="off" disabled={busy} placeholder={kind==='subscription'?'https://…':kind==='json'?'[{"remarks":"…","outbounds":[]}]':'vless://…'} onChange={event=>{setText(event.target.value);if(/^[\s]*[\[{]/.test(event.target.value))setKind('json');else if(/^[-a-z0-9+]+:\/\//i.test(event.target.value)&&!/^https?:/i.test(event.target.value))setKind('servers');}}/></label>
      {kind==='json'&&<label className="json-file">{t.file}<input type="file" accept=".json,application/json" disabled={busy} onChange={async event=>{const file=event.target.files?.[0];if(file&&file.size<=2097152)setText(await file.text());event.target.value='';}}/></label>}
      <p className="source-hint">{kind==='subscription'?t.subHint:kind==='json'?t.jsonHint:t.hint}</p>
      {error&&<p className="error" role="alert">{t.error}</p>}
      <button className="primary" disabled={busy||!text.trim()}>{t.add}</button>
    </form>
    {!hasAccount&&<button className="text-button" disabled={busy} onClick={onLogin}>{t.login}</button>}
  </dialog>;
}
