const copy={ru:{title:'Mini Throne для Windows',description:'Установите приложение — подписка и оформление подключатся автоматически.',download:'Скачать готовый установочный пакет',extract:'Распакуйте архив целиком и запустите Mini-Throne-Setup.exe. Вход произойдёт один раз; пакет действует 30 минут. Не передавайте его другим людям.',launch:'Приложение уже установлено',manual:'Персональный установщик ещё не опубликован. Установите тестовую сборку, затем откройте приложение для входа.',connecting:'Подключение компьютера',compare:'Сравните код с кодом в Mini Throne. Подтверждайте только вход, который начали сами.',approve:'Код совпадает — подключить',approved:'Готово! Вернитесь в Mini Throne.',failed:'Не удалось выполнить действие. Обновите страницу и повторите.',devices:'Подключённые компьютеры',revoke:'Отозвать доступ',empty:'Подключённых компьютеров пока нет.',signIn:'Войдите в личный кабинет, чтобы подключить компьютер.',loading:'Подготавливаем…'},en:{title:'Mini Throne for Windows',description:'Install the app — your subscription and branding connect automatically.',download:'Download personal installation package',extract:'Extract the entire archive and run Mini-Throne-Setup.exe. Sign-in works once; the package expires in 30 minutes. Do not share it.',launch:'I already have the app',manual:'The personal installer is not published yet. Install the test build, then open the app to sign in.',connecting:'Connect your computer',compare:'Compare this code with Mini Throne. Only approve a sign-in you started yourself.',approve:'Codes match — connect',approved:'Done! Return to Mini Throne.',failed:'Could not complete this action. Refresh the page and retry.',devices:'Connected computers',revoke:'Revoke access',empty:'No connected computers yet.',signIn:'Sign in to your account to connect your computer.',loading:'Preparing…'}};
export function mountView(view,target,props){
  const t=copy[props.language==='en'?'en':'ru'];
  const root=document.createElement('section');root.className='mini-throne-plugin';target.append(root);
  let disposed=false;
  const add=(tag,text,parent=root)=>{const element=document.createElement(tag);element.textContent=text;parent.append(element);return element;};
  const error=()=>{if(!disposed)add('p',t.failed).setAttribute('role','alert');};
  const button=(text,action)=>{const el=add('button',text);el.type='button';el.onclick=async()=>{el.disabled=true;try{await action(el);}catch{error();}finally{if(!disposed)el.disabled=false;}};return el;};
  async function render(){
    if(view==='connect'){
      const id=new URL(location.href).searchParams.get('request');
      add('h2',t.connecting);
      if(id&&/^[a-f0-9]{32}$/.test(id)){
        const pending=await props.host.request(`/v1/pending?request=${encodeURIComponent(id)}`);
        if(disposed)return;
        add('p',pending.device_name);add('p',pending.user_code).className='mt-code';add('p',t.compare);
        if(pending.approved)add('p',t.approved);
        else button(t.approve,async el=>{await props.host.request('/v1/approve',{method:'POST',body:JSON.stringify({request_id:id,user_code:pending.user_code})});el.remove();add('p',t.approved);});
      }else{
        const items=await props.host.request('/v1/devices');if(disposed)return;
        add('h3',t.devices);
        if(!items.devices.length)add('p',t.empty);
        for(const device of items.devices){const label=add('p',new Date(device.last_authorized_at*1000).toLocaleString(props.language));const revoke=button(t.revoke,async el=>{await props.host.request('/v1/devices/revoke',{method:'POST',body:JSON.stringify({id:device.id})});label.remove();el.remove();});revoke.className='mt-secondary';}
      }
      return;
    }
    add('h3',t.title);add('p',t.description);
    const status=await props.host.request('/v1/enrollment/status');if(disposed)return;
    if(status.available){button(t.download,async el=>{el.textContent=t.loading;try{const delivery=await props.host.request('/v1/enrollment',{method:'POST',body:JSON.stringify({})});if(!/^\/api\/plugins\/mini-throne\/v1\/installer\/[a-f0-9]{32}$/.test(delivery.download_path))throw new Error('invalid_download');const link=add('a','');link.href=delivery.download_path;link.download='Mini-Throne-Personal-Setup.zip';link.click();link.remove();}finally{el.textContent=t.download;}});add('small',t.extract);}
    else add('p',t.manual);
    const launch=add('a',t.launch);launch.className='mt-launch';launch.href=`mini-throne://connect?instance=${encodeURIComponent(location.origin)}`;
  }
  void render().catch(error);
  return {root,dispose(){disposed=true;root.remove();}};
}
export function unmountView(instance){instance.dispose();}
