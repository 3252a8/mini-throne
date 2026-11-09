import React,{useEffect,useRef} from 'react';

export function Icon({name,size=20}:{name:string;size?:number}){
  const paths:Record<string,React.ReactNode>={power:<><path d="M12 3v9"/><path d="M6.4 5.7a9 9 0 1 0 11.2 0"/></>,gear:<><path d="m9 3-.6 2-2 .9-1.9-.4-2 3.5L4 10.5v2.9L2.5 15l2 3.5 2-.4 1.9 1L9 21h4l.6-1.9 2-1 1.9.4 2-3.5-1.5-1.6v-2.9L19.5 9l-2-3.5-1.9.4-2-.9L13 3z"/><circle cx="11" cy="12" r="3"/></>,arrow:<path d="m9 5 7 7-7 7"/>,back:<path d="m14 5-7 7 7 7M7 12h14"/>,plus:<path d="M12 5v14M5 12h14"/>,close:<path d="m6 6 12 12M18 6 6 18"/>,card:<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h3"/></>,checkCircle:<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,check:<path d="m5 12 4 4L19 6"/>,external:<><path d="M14 3h7v7M21 3l-9 9"/><path d="M11 4H4v16h16v-7"/></>};
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export function Dialog({title,onClose,children,className='',busy=false}:{title:string;onClose:()=>void;children:React.ReactNode;className?:string;busy?:boolean}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
  return <dialog ref={ref} className={`dialog ${className}`} aria-label={title} onCancel={event=>{event.preventDefault();if(!busy)onClose();}}><header className="dialog-header"><h2>{title}</h2><button className="icon-button" aria-label="Close / Закрыть" disabled={busy} onClick={onClose}><Icon name="close"/></button></header>{children}</dialog>;
}
export function Switch({title,hint,checked,disabled,onChange}:{title:string;hint?:string;checked:boolean;disabled:boolean;onChange:(value:boolean)=>void}){
  return <label className="setting-row"><span><strong>{title}</strong>{hint&&<small>{hint}</small>}</span><input type="checkbox" role="switch" aria-label={title} checked={checked} disabled={disabled} onChange={event=>onChange(event.target.checked)}/></label>;
}
