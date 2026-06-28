// Preços de REVENDA (Preço s/ST) no mazer.com.br — exige login.
// As credenciais ficam em variáveis de ambiente do Netlify (NUNCA no código):
//   MAZER_USER = e-mail de login   |   MAZER_PASS = senha
// Modos:  ?q=ssd kingston   -> lista produtos {nome, link, preco(lista)}
//         ?detalhe=/produtos/detalhe/slug/...  -> { precoST, nome, img }
const MZ = 'https://www.mazer.com.br';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
let _cookie = null, _cookieAt = 0;

function precoNum(s){ s=String(s||'').trim(); if(/,\d{2}$/.test(s)) s=s.replace(/\./g,'').replace(',','.'); const n=parseFloat(s); return (!isNaN(n)&&n>0)?n:null; }
function decode(s){ return (s||'').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim(); }

function getCookies(res){
  let arr=[];
  try{ if(typeof res.headers.getSetCookie==='function') arr=res.headers.getSetCookie(); }catch(e){}
  if((!arr||!arr.length) && res.headers.raw){ try{ arr=res.headers.raw()['set-cookie']||[]; }catch(e){} }
  if((!arr||!arr.length)){ const one=res.headers.get('set-cookie'); if(one) arr=[one]; }
  return (arr||[]).map(c=>c.split(';')[0]).filter(Boolean).join('; ');
}
async function login(){
  if(_cookie && (Date.now()-_cookieAt) < 10*60*1000) return _cookie;   // reusa a sessão por 10 min
  const user=process.env.MAZER_USER, pass=process.env.MAZER_PASS;
  if(!user||!pass) throw new Error('Credenciais do Mazer não configuradas (defina MAZER_USER e MAZER_PASS no Netlify).');
  const body=new URLSearchParams();
  body.set('credential[username]', user);
  body.set('credential[password]', pass);
  body.set('top_login', 'entrar');
  const r=await fetch(MZ+'/cliente/entrar', {method:'POST', redirect:'manual',
    headers:{'User-Agent':UA,'Content-Type':'application/x-www-form-urlencoded','Referer':MZ+'/','Origin':MZ}, body:body.toString()});
  let cookie=getCookies(r);
  // se o login redireciona e seta cookie no caminho, segue 1 passo carregando o cookie atual
  const loc=r.headers.get('location');
  if(loc){ try{ const r2=await fetch(/^https?:/i.test(loc)?loc:MZ+loc,{redirect:'manual',headers:{'User-Agent':UA,'Cookie':cookie,'Referer':MZ+'/'}}); const c2=getCookies(r2); if(c2) cookie=mergeCookies(cookie,c2); }catch(e){} }
  if(!cookie) throw new Error('Não consegui autenticar no Mazer (sem cookie de sessão).');
  _cookie=cookie; _cookieAt=Date.now();
  return _cookie;
}
function mergeCookies(a,b){ const map={}; (a+'; '+b).split('; ').filter(Boolean).forEach(kv=>{const i=kv.indexOf('='); if(i>0) map[kv.slice(0,i)]=kv.slice(i+1);}); return Object.entries(map).map(([k,v])=>k+'='+v).join('; '); }
async function get(path){
  const cookie=await login();
  const r=await fetch(MZ+path, {headers:{'User-Agent':UA,'Cookie':cookie,'Referer':MZ+'/'}});
  const t=await r.text();
  // sessão expirou? tenta logar de novo 1x
  if(/formLogin|credential\[username\]/.test(t) && !/Pre[çc]o s\/ST/i.test(t)){
    _cookie=null; const ck=await login();
    const r2=await fetch(MZ+path,{headers:{'User-Agent':UA,'Cookie':ck,'Referer':MZ+'/'}});
    return r2.text();
  }
  return t;
}
function parseST(html){
  const i=html.search(/Pre[çc]o\s*s\/ST/i);
  const seg = i>=0 ? html.slice(i, i+2500) : html;
  const m=seg.match(/(\d{1,3}(?:\.\d{3})*,\d{2})(?!\s*%)/);   // 1º valor em R$ que não é porcentagem = s/ST
  return m?precoNum(m[1]):null;
}
function semAcento(s){ return (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }
function parseBusca(html,q){
  const cards=html.split(/<div class="box-img-listagem"/i).slice(1);
  const termos=semAcento(q).split(/\s+/).filter(Boolean);
  const out=[]; const vistos=new Set();
  for(const c of cards){
    const lk=c.match(/href="(\/produtos\/detalhe\/slug\/[^"]+)"/i);
    const nm=c.match(/nome-produto-3linhas">([\s\S]*?)<\/p>/i);
    const pr=c.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
    const im=c.match(/<img[^>]+(?:data-src|src)="(https?:\/\/[^"]*(?:mazer-img|imagem\/produto)[^"]*)"/i);
    if(lk&&nm){
      const nome=decode(nm[1].replace(/<[^>]+>/g,' ')).replace(/^C[oó]d:\s*\d+\s*/i,'').trim();
      const low=semAcento(nome);
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
      const nm=(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)||[])[1]||'';
      const img=(html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)||[])[1]||'';
      return {statusCode:200,headers,body:JSON.stringify({precoST:parseST(html), nome:decode(nm), img})};
    }
    const q=(p.q||'').trim();
    if(!q) return {statusCode:400,headers,body:JSON.stringify({erro:'Informe o que pesquisar (q).'})};
    const html=await get('/busca/'+encodeURIComponent(q));
    return {statusCode:200,headers,body:JSON.stringify({itens:parseBusca(html,q)})};
  }catch(e){ return {statusCode:500,headers,body:JSON.stringify({erro:String(e.message||e)})}; }
};
