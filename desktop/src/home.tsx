import {useState} from 'react';


type HomeProps={language:'ru'|'en';name:string;logo:string|null;connected:boolean;busy:boolean;ready:boolean;active:boolean;disabled:boolean;service:boolean;expiresAt:string|null;traffic:{used_bytes:number|null;limit_bytes:number|null}|null;server:string|null;source:string|null;onSources:()=>void;onServers:()=>void;onConnect:()=>void;onRenew:()=>void;hasServers:boolean;canRenew:boolean};
const copy={ru:{active:'Подписка активна',inactive:'Подписка неактивна',until:'до',add:'Добавить подписку или сервер',source:'Подписка',manage:'Подписки и серверы',traffic:'Использовано',of:'из',unlimited:'Без лимита',server:'Сервер',choose:'Выбрать сервер',connect:'Подключить',disconnect:'Отключить',connecting:'Подключаемся…',starting:'Запускаем приложение…',online:'Подключено',offline:'Не подключено',renew:'Продлить подписку'},en:{active:'Subscription active',inactive:'Subscription inactive',until:'until',add:'Add subscription or server',source:'Subscription',manage:'Subscriptions and servers',traffic:'Traffic used',of:'of',unlimited:'Unlimited',server:'Server',choose:'Choose server',connect:'Connect',disconnect:'Disconnect',connecting:'Connecting…',starting:'Starting the app…',online:'Connected',offline:'Disconnected',renew:'Renew subscription'}};
function Glyph({name}:{name:'check'|'arrow'|'power'|'card'|'plus'}){return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name==='check'?<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>:name==='arrow'?<path d="m9 5 7 7-7 7"/>:name==='power'?<><path d="M12 3v9"/><path d="M6.4 5.7a9 9 0 1 0 11.2 0"/></>:name==='card'?<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h3"/></>:<path d="M12 5v14M5 12h14"/>}</svg>}
function bytes(value:number,language:string){const units=['B','KB','MB','GB','TB'];let unit=0;while(value>=1024&&unit<units.length-1){value/=1024;unit++;}return `${new Intl.NumberFormat(language,{maximumFractionDigits:unit?2:0}).format(value)} ${units[unit]}`;}
export function Home(p:HomeProps){
  const t=copy[p.language], [brokenLogo,setBrokenLogo]=useState<string|null>(null);
  const date=p.expiresAt?new Date(p.expiresAt):null;
  const used=p.traffic?.used_bytes,limit=p.traffic?.limit_bytes;
  const percent=typeof used==='number'&&typeof limit==='number'&&limit>0?Math.min(100,Math.max(0,used/limit*100)):null;
  const status=p.connected?t.online:p.busy?t.connecting:p.ready?t.offline:t.starting;
  return <section className="home service-home">
    <div className="service-brand">{p.logo&&p.logo!==brokenLogo?<img className="service-logo" src={p.logo} alt="" onError={()=>setBrokenLogo(p.logo)}/>:<svg className={`service-logo connection-shield ${p.connected?'online':'offline'}`} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={p.connected?t.online:t.offline}><path d="M32 6 53 14v17c0 13-9 22-21 27C20 53 11 44 11 31V14L32 6Z"/>{p.connected?<path d="m22 31 7 7 14-15"/>:<path d="m24 24 16 16m0-16L24 40"/>}</svg>}<h1>{p.name}</h1></div>
    <div className="home-controls">
      <div className={`subscription-card ${p.active?'is-active':''}`}>
        <Glyph name={p.active?'check':'plus'}/><span><strong>{p.source?(p.service?(p.active?t.active:t.inactive):p.source):t.add}</strong><small>{p.service&&date&&Number.isFinite(date.getTime())?`${t.until} ${date.toLocaleDateString(p.language)}`:p.source?t.source:status}</small></span>
      </div>
      {!p.source&&<button className="secondary" disabled={p.disabled} onClick={p.onSources}>{t.add}</button>}
      {p.service&&typeof used==='number'&&<div className="traffic-card"><div><span>{t.traffic}</span><strong>{bytes(used,p.language)}{typeof limit==='number'&&limit>0?` ${t.of} ${bytes(limit,p.language)} · ${Math.round(percent||0)}%`:` · ${t.unlimited}`}</strong></div>{percent!==null&&<progress value={percent} max={100} aria-label={t.traffic}/>}</div>}
      <button className="server-card" disabled={p.disabled||!p.hasServers} onClick={p.onServers} aria-label={t.choose}><span>{t.server}</span><strong className="server-name">{p.server||t.choose}</strong><Glyph name="arrow"/></button>
      <button className={`primary connect-button ${p.connected?'connected':''}`} disabled={p.disabled||!p.active||!p.server} onClick={p.onConnect}><Glyph name="power"/>{p.busy?t.connecting:p.connected?t.disconnect:t.connect}</button>
      {p.canRenew&&<button className="secondary renew-button" disabled={p.busy} onClick={p.onRenew}><Glyph name="card"/>{t.renew}</button>}
      <p className="home-status" role="status"><span className={`status-dot ${p.connected?'online':''}`}/>{status}</p>
    </div>
  </section>;
}
