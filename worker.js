const json = (data, status=200, extra={}) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=UTF-8', ...extra}});
const cookie = (name) => name.split(';').map(x=>x.trim()).find(x=>x.startsWith('turkmc_admin='))?.split('=')[1];
async function signToken(secret){
  const payload = btoa(JSON.stringify({exp:Date.now()+86400000}));
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  return payload+'.'+b64;
}
async function verifyToken(token,secret){
  try{const [payload,sig]=token.split('.');if(!payload||!sig)return false;const obj=JSON.parse(atob(payload));if(obj.exp<Date.now())return false;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);const raw=Uint8Array.from(atob(sig.replaceAll('-','+').replaceAll('_','/')+'=='),c=>c.charCodeAt(0));return await crypto.subtle.verify('HMAC',key,raw,new TextEncoder().encode(payload))}catch{return false}}
async function admin(request,env){const token=cookie(request.headers.get('Cookie')||'');return !!(env.ADMIN_PASSWORD&&token&&await verifyToken(token,env.ADMIN_PASSWORD))}
export default {async fetch(request,env){const url=new URL(request.url);try{
 if(url.pathname==='/api/servers' && request.method==='GET'){const r=await env.DB.prepare("SELECT id,name,ip,type,description,discord,website AS link,status,created_at,updated_at FROM servers WHERE status='published' ORDER BY created_at DESC").all();return json({servers:r.results||[]})}
 if(url.pathname==='/api/servers' && request.method==='POST'){const b=await request.json();if(!b.name||!b.ip||!b.type)return json({error:'Sunucu adı, IP ve tür zorunludur.'},400);await env.DB.prepare("INSERT INTO servers (name,ip,type,description,website,status) VALUES (?,?,?,?,?,'pending')").bind(b.name,b.ip,b.type,b.description||'',b.link||'').run();return json({ok:true},201)}
 if(url.pathname==='/api/admin/login' && request.method==='POST'){const b=await request.json();if(!env.ADMIN_PASSWORD)return json({error:'ADMIN_PASSWORD secret ayarlanmamış.'},500);if(b.password!==env.ADMIN_PASSWORD)return json({error:'Şifre hatalı.'},401);const token=await signToken(env.ADMIN_PASSWORD);return json({ok:true},200,{'Set-Cookie':`turkmc_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`})}
 if(url.pathname==='/api/admin/me' && request.method==='GET')return (await admin(request,env))?json({ok:true}):json({error:'Unauthorized'},401);
 if(url.pathname==='/api/admin/servers' && request.method==='GET'){if(!await admin(request,env))return json({error:'Unauthorized'},401);const r=await env.DB.prepare('SELECT id,name,ip,type,description,discord,website AS link,status,created_at,updated_at FROM servers ORDER BY created_at DESC').all();return json({servers:r.results||[]})}
 const m=url.pathname.match(/^\/api\/admin\/servers\/(\d+)$/);if(m){if(!await admin(request,env))return json({error:'Unauthorized'},401);const id=Number(m[1]);if(request.method==='DELETE'){await env.DB.prepare('DELETE FROM servers WHERE id=?').bind(id).run();return json({ok:true})}if(request.method==='PATCH'){const b=await request.json();const cur=await env.DB.prepare('SELECT * FROM servers WHERE id=?').bind(id).first();if(!cur)return json({error:'Sunucu bulunamadı.'},404);const name=b.name??cur.name,ip=b.ip??cur.ip,type=b.type??cur.type,description=b.description??cur.description,link=b.link??cur.website,status=b.status??cur.status;await env.DB.prepare('UPDATE servers SET name=?,ip=?,type=?,description=?,website=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(name,ip,type,description,link,status,id).run();return json({ok:true})}}
 if(url.pathname==='/admin' || url.pathname==='/admin/')return env.ASSETS.fetch(new Request(new URL('/index.html',request.url),request));
 return env.ASSETS.fetch(request);
}catch(e){return json({error:e.message||'Sunucu hatası'},500)}}};
