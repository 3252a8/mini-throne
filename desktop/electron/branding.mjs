export const DEFAULT_THEME=Object.freeze({accent:'#00fe7a',bg:'#060b0e',panel:'#11191f',panel_2:'#18232c',border:'#303a40',text:'#eef3f4',muted:'#a4b1ae'});
export function color(value){
  if(typeof value!=='string')return null;
  if(/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value))return value;
  const match=value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/);
  return match&&match.slice(1,4).every(v=>Number(v)<=255)?value:null;
}
export function normalizeBranding(brand={}){
  const theme={...DEFAULT_THEME};
  for(const key of Object.keys(theme))theme[key]=color(brand.theme?.[key])||theme[key];
  theme.accent=color(brand.theme?.accent)||color(brand.accent)||theme.accent;
  return {name:typeof brand.name==='string'&&brand.name.trim()?brand.name.trim().slice(0,80):'/mini-throne',accent:theme.accent,theme};
}
