const protocols={vless:'VLESS',vmess:'VMess',trojan:'Trojan',shadowsocks:'Shadowsocks',socks:'SOCKS',http:'HTTP',hysteria:'Hysteria 2',hysteria2:'Hysteria 2',tuic:'TUIC',wireguard:'WireGuard',ssh:'SSH',openvpn:'OpenVPN',openconnect:'OpenConnect',naive:'Naive'};
const transports={tcp:'TCP',raw:'TCP',xhttp:'XHTTP',splithttp:'XHTTP',ws:'WebSocket',grpc:'gRPC',http:'HTTP/2',h2:'HTTP/2',httpupgrade:'HTTPUpgrade',quic:'QUIC',kcp:'mKCP',hysteria:'QUIC'};
const protections={tls:'TLS',reality:'Reality'};
// Only fixed labels reach the renderer; configs, addresses and credentials stay here.
export function profileDetails(type,outbound){
  let config=outbound;
  if(type==='custom'){
    try{config=typeof outbound?.config==='string'?JSON.parse(outbound.config):outbound?.config;}catch{return {labels:[],automatic:false};}
  }
  const nodes=Array.isArray(config?.outbounds)?config.outbounds:[config];
  const labels=[];
  for(const node of nodes){
    if(!node||typeof node!=='object')continue;
    const protocol=protocols[node.protocol||node.type||type];if(!protocol)continue;
    const stream=node.streamSettings||node.stream||node;
    const transport=transports[stream.network||stream.transport?.type||node.transport?.type];
    const security=protections[stream.security]||(node.tls?.enabled?(node.tls.reality?.enabled?'Reality':'TLS'):null);
    const label=[protocol,transport,security].filter(Boolean).join(' · ');
    if(!labels.includes(label))labels.push(label);
  }
  return {labels:labels.slice(0,12),automatic:!!config?.routing?.balancers?.length||type==='autoselector'};
}
