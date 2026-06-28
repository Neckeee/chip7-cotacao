// Preços de revenda na Distribuidora Guarapuava (Magento) — exige login.
// Credenciais em variáveis de ambiente do Netlify (NUNCA no código):
//   GUARA_USER = e-mail   |   GUARA_PASS = senha
// ?q=ssd kingston  -> lista {nome, link, preco}   (o preço de revenda já vem na busca)
const GUA = 'https://distribuidoraguarapuava.com.br';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
let _cookie=null, _cookieAt=0;

function precoNum(s){ s=String(s||'').trim(); if(/,\d{2}$/.test(s)) s=s.replace(/\./g,'').replace(',','.'); const n=parseFloat(s); return (!isNaN(n)&&n>0)?n:null; }
function decode(s){ return (s||'').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim(); }
function getCookies(res){
  let arr=[]; try{ if(typeof res.headers.getSetCookie==='function') arr=res.headers.getSetCookie(); }catch(e){}
  if((!arr||!arr.length) && res.headers.raw){ try{ arr=res.headers.raw()['set-cookie']||[]; }catch(e){} }
  if(!arr||!arr.length){ const one=res.headers.get('set-cookie'); if(one) arr=[one]; }
  return (arr||[]).map(c=>c.split(';')[0]).filter(Boolean).join('; ');
}
function mergeCookies(a,b){ const m={}; (a+'; '+b).split('; ').filter(Boolean).forEach(kv=>{const i=kv.indexOf('='); if(i>0) m[kv.slice(0,i)]=kv.slice(i+1);}); return Object.entries(m).map(([k,v])=>k+'='+v).join('; '); }
async function login(){
  if(_cookie && (Date.now()-_cookieAt) < 10*60*1000) return _cookie;
  const user=process.env.GUARA_USER, pass=process.env.GUARA_PASS;
  if(!user||!pass) throw new Error('Credenciais da Guarapuava não configuradas (defina GUARA_USER e GUARA_PASS no Netlify).');
  // 1) página de login -> form_key + cookie
  const r1=await fetch(GUA+'/customer/account/login/',{headers:{'User-Agent':UA}});
  let cookie=getCookies(r1);
  const html=await r1.text();
  const fk=(html.match(/name="form_key"[^>]*value="([^"]+)"/i)||html.match(/value="([^"]+)"[^>]*name="form_key"/i)||[])[1];
  if(!fk) throw new Error('form_key não encontrado no login da Guarapuava.');
  // 2) POST login
  const body=new URLSearchParams();
  body.set('form_key',fk); body.set('login[username]',user); body.set('login[password]',pass); body.set('send','');
  const r2=await fetch(GUA+'/customer/account/loginPost/',{method:'POST',redirect:'manual',
    headers:{'User-Agent':UA,'Content-Type':'application/x-www-form-urlencoded','Cookie':cookie,'Referer':GUA+'/customer/account/login/'}, body:body.toString()});
  cookie=mergeCookies(cookie, getCookies(r2));
  if(!cookie) throw new Error('Não consegui autenticar na Guarapuava.');
  _cookie=cookie; _cookieAt=Date.now();
  return _cookie;
}
async function get(path){
  const cookie=await login();
  const r=await fetch(GUA+path,{headers:{'User-Agent':UA,'Cookie':cookie,'Referer':GUA+'/'}});
  return r.text();
}
function semAcento(s){ return (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }
function parseBusca(html,q){
  const cards=html.split(/<div class="produto /i).slice(1);
  const termos=semAcento(q).split(/\s+/).filter(Boolean);
  const out=[]; const vistos=new Set();
  for(const c of cards){
    const lk=c.match(/href="([^"]+)"/i);
    const nm=c.match(/descr-produto">\s*<p>([^<]+)<\/p>/i) || c.match(/title="([^"]+)"/i);
    const pr=c.match(/box-preco">\s*<p>\s*R\$\s?([\d.]+,\d{2})/i) || c.match(/R\$\s?([\d.]+,\d{2})/);
    const im=c.match(/<img[^>]+(?:data-src|src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
    if(lk&&nm){
      const nome=decode(nm[1]); const low=semAcento(nome);
      if(termos.every(t=>low.includes(t)) && !vistos.has(lk[1])){
        vistos.add(lk[1]);
        out.push({nome, link:lk[1], preco: pr?precoNum(pr[1]):null, img: im?im[1]:''});
      }
    }
  }
  return out.slice(0,20);
}
exports.handler=async(event)=>{
  const headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/json; charset=utf-8'};
  const p=event.queryStringParameters||{};
  try{
    if(p.detalhe){
      let path=p.detalhe.replace(/^https?:\/\/[^/]+/,''); if(!path.startsWith('/')) path='/'+path;
      const html=await get(path);
      const pr=html.match(/box-preco">\s*<p>\s*R\$\s?([\d.]+,\d{2})/i) || html.match(/R\$\s?([\d.]+,\d{2})/);
      const nm=(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)||[])[1]||'';
      const img=(html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)||[])[1]||'';
      return {statusCode:200,headers,body:JSON.stringify({preco:pr?precoNum(pr[1]):null, precoST:pr?precoNum(pr[1]):null, nome:decode(nm), img})};
    }
    const q=(p.q||'').trim();
    if(!q) return {statusCode:400,headers,body:JSON.stringify({erro:'Informe o que pesquisar (q).'})};
    const html=await get('/catalogsearch/result/?q='+encodeURIComponent(q));
    return {statusCode:200,headers,body:JSON.stringify({itens:parseBusca(html,q)})};
  }catch(e){ return {statusCode:500,headers,body:JSON.stringify({erro:String(e.message||e)})}; }
};
