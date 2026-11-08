const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('miniThrone',Object.freeze({
  state:()=>ipcRenderer.invoke('mini:state'),
  login:origin=>ipcRenderer.invoke('mini:login',origin),
  cancelLogin:()=>ipcRenderer.invoke('mini:cancel-login'),
  connect:id=>ipcRenderer.invoke('mini:connect',id),
  disconnect:()=>ipcRenderer.invoke('mini:disconnect'),
  refresh:()=>ipcRenderer.invoke('mini:refresh'),
  logout:()=>ipcRenderer.invoke('mini:logout'),
  settings:values=>ipcRenderer.invoke('mini:settings',values),
  update:()=>ipcRenderer.invoke('mini:update'),
  onState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('mini:state',listener);return()=>ipcRenderer.removeListener('mini:state',listener);}
}));
